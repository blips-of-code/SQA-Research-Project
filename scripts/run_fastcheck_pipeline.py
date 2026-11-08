#!/usr/bin/env python3
"""Resumable fast-check runner. Runs only explicitly defined, real properties."""
import argparse
import csv
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
COLUMNS = ['FilePath','TestCaseName','FunctionName','Status','ExpectedValue','ProvidedValue','ErrorMessage','FailureCategory','InputParamater']
REPO = 'sql-formatter-org-sql-formatter'
TESTS = [
    ('src/lexer/regexUtil.ts','escapeRegExp'),
    ('src/lexer/lineColFromIndex.ts','lineColFromIndex'),
    ('src/utils.ts','dedupe'),
    ('src/expandPhrases.ts','expandPhrases'),
    ('src/expandPhrases.ts','expandSinglePhrase'),
    ('src/utils.ts','last'),
]

def read_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

def write_csv(path, columns, rows):
    temp = path.with_suffix(path.suffix + '.tmp')
    with temp.open('w',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=columns,extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)
    temp.replace(path)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--limit',type=int,default=4,help='Max defined tests this run')
    parser.add_argument('--runs',type=int,default=100)
    parser.add_argument('--timeout',type=int,default=30,help='Seconds allowed per test')
    parser.add_argument('--retry-blocked',action='store_true')
    args=parser.parse_args()
    if args.limit < 1 or args.runs < 1 or args.timeout < 1: parser.error('limit, runs, timeout must be positive')
    repo=ROOT/'pilot-repositories'/REPO
    inventory=ROOT/'typescript-files.csv'
    results_file=ROOT/'fast-check-results.csv'
    blocked_file=ROOT/'fast-check-blocked.csv'
    coverage_file=ROOT/'fast-check-coverage.csv'
    worker=ROOT/'scripts'/'fastcheck_worker.cjs'
    if not repo.is_dir(): parser.error(f'Missing extracted pilot repository: {repo}')
    if not inventory.is_file(): parser.error(f'Missing existing inventory: {inventory}')
    if not worker.is_file(): parser.error(f'Missing worker script: {worker}')
    results=read_csv(results_file) if results_file.exists() else []
    blocked=read_csv(blocked_file) if blocked_file.exists() else []
    finished={(r['FilePath'].replace('\\','/'),r['FunctionName']) for r in results}
    blocked_ids={(r['FilePath'].replace('\\','/'),r['FunctionName']) for r in blocked}
    if args.retry_blocked:
        blocked=[]
        blocked_ids=set()
    executed=0
    for rel, fn in TESTS:
        source=(repo/rel).resolve()
        key=(str(source).replace('\\','/'),fn)
        if key in finished or key in blocked_ids: continue
        if executed >= args.limit: break
        executed+=1
        if not source.is_file():
            blocked.append({'FilePath':str(source),'FunctionName':fn,'Reason':'Source file missing'})
            write_csv(blocked_file,['FilePath','FunctionName','Reason'],blocked)
            print('BLOCKED',rel,': source missing')
            continue
        with tempfile.TemporaryDirectory() as tmp:
            job_file=Path(tmp)/'job.json'
            response_file=Path(tmp)/'response.json'
            job={'absolutePath':str(source),'relativePath':rel,'functionName':fn,'numRuns':args.runs,'seed':12345,'responseFile':str(response_file)}
            job_file.write_text(json.dumps(job),encoding='utf-8')
            try:
                proc=subprocess.run(['node',str(worker),str(job_file)],cwd=ROOT,timeout=args.timeout,capture_output=True,text=True)
                if proc.returncode or not response_file.exists():
                    raise RuntimeError((proc.stderr or proc.stdout or 'Worker did not return a result').strip().splitlines()[-1][:500])
                response=json.loads(response_file.read_text(encoding='utf-8'))
                rows=response['rows']
                if not rows or any(r['Status'] not in ('Passed','Failed') for r in rows): raise RuntimeError('Invalid worker response')
                results.extend(rows)
                write_csv(results_file,COLUMNS,results)
                finished.add(key)
                print(rows[0]['Status'].upper(),rel,'::',fn,'(',response['checks'],'checks )')
            except (subprocess.TimeoutExpired,Exception) as exc:
                reason='Timed out' if isinstance(exc,subprocess.TimeoutExpired) else str(exc)
                blocked.append({'FilePath':str(source),'FunctionName':fn,'Reason':reason})
                write_csv(blocked_file,['FilePath','FunctionName','Reason'],blocked)
                print('BLOCKED',rel,'::',fn,':',reason)
    # Coverage: file inventory is authoritative; no untested file is labeled Passed.
    inventory_rows=read_csv(inventory)
    if not inventory_rows: parser.error('typescript-files.csv is empty')
    inventory_cols=set(inventory_rows[0])
    print('Inventory columns:',', '.join(inventory_rows[0].keys()))
    # Inventory may contain absolute paths or relative paths; preserve its original values.
    file_field=next((c for c in ('FilePath','File','Path','file_path','path') if c in inventory_cols),None)
    repo_field=next((c for c in ('Repository','Repo','repository') if c in inventory_cols),None)
    if file_field:
        coverage=[]
        tested_by_path={r['FilePath'].replace('\\','/'):r['Status'] for r in results}
        blocked_paths={r['FilePath'].replace('\\','/') for r in blocked}
        for item in inventory_rows:
            p=str(item[file_field]).replace('\\','/')
            repository=str(item.get(repo_field,'')).strip() if repo_field else ''
            candidates=[p]
            if repository and not Path(p).is_absolute() and not (len(p)>1 and p[1]==':'):
                candidates.append(str((ROOT/'pilot-repositories'/repository/p).resolve()).replace('\\','/'))
            if p.startswith(REPO+'/'):
                candidates.append(str((repo/p[len(REPO)+1:]).resolve()).replace('\\','/'))
            status=next((tested_by_path[x] for x in candidates if x in tested_by_path),None)
            if not status: status='Blocked' if any(x in blocked_paths for x in candidates) else 'NotTested'
            coverage.append({'Repository':repository,'FilePath':p,'CoverageStatus':status})
        write_csv(coverage_file,['Repository','FilePath','CoverageStatus'],coverage)
        print('Coverage entries:',len(coverage),'(NotTested means no property was run)')
    else:
        print('WARNING: Could not identify inventory file-path column; no coverage CSV written.')
    print('Actual test results:',len(results),'parameter rows; blocked:',len(blocked))
    print('Saved:',results_file)
    print('Saved:',blocked_file if blocked_file.exists() else '(no blocked file; none blocked)')
    print('Re-running resumes without repeating completed tests.')

if __name__=='__main__': main()
