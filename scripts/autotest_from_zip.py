#!/usr/bin/env python3
"""Conservative AST-pattern-based property testing across the existing runnable-file inventory.
No synthetic Passed statuses. ZIP is read without extracting entire repositories.
"""
import argparse,csv,json,subprocess,tempfile,zipfile,sys
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parent.parent
COLUMNS=['FilePath','TestCaseName','FunctionName','Status','ExpectedValue','ProvidedValue','ErrorMessage','FailureCategory','InputParamater']
def readcsv(p):
    if not p.exists():return []
    with p.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def writecsv(p,cols,rows):
    tmp=p.with_suffix(p.suffix+'.tmp')
    with tmp.open('w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=cols,extrasaction='ignore');w.writeheader();w.writerows(rows)
    tmp.replace(p)
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--zip',default=str(Path.home()/'Downloads'/'yzz0229-VSCODE-DATA.zip'))
    ap.add_argument('--limit',type=int,default=25,help='Maximum NEW real tests to execute; 0 means scan only')
    ap.add_argument('--runs',type=int,default=100)
    ap.add_argument('--timeout',type=int,default=20)
    a=ap.parse_args()
    if a.limit<0 or a.runs<1 or a.timeout<1:ap.error('Invalid limit/runs/timeout')
    zp=Path(a.zip);inventory=ROOT/'typescript-files.csv';worker=ROOT/'scripts'/'autotest_worker.cjs'
    if not zp.exists():ap.error(f'ZIP not found: {zp}')
    if not inventory.exists():ap.error('typescript-files.csv missing')
    if not worker.exists():ap.error('autotest_worker.cjs missing')
    inv=readcsv(inventory);print('Inventory rows:',len(inv),flush=True)
    results_path=ROOT/'fast-check-results.csv';blocked_path=ROOT/'fast-check-auto-blocked.csv';eligible_path=ROOT/'fast-check-auto-eligible.csv'
    results=readcsv(results_path);blocked=readcsv(blocked_path)
    done={(r['FilePath'].replace('\\','/'),r['FunctionName']) for r in results}
    blocked_done={(r['FilePath'].replace('\\','/'),r['FunctionName']) for r in blocked}
    with zipfile.ZipFile(zp) as z:
        names=z.namelist()
        # Index each ZIP member once, avoiding a scan of the entire archive for each TS file.
        repo_names={r.get('Repository','').strip() for r in inv}
        member_index={}
        for n in names:
            clean=n.replace('\\','/')
            if not clean.lower().endswith(('.ts','.tsx')) or clean.endswith('/'):continue
            parts=clean.split('/')
            for pos,part in enumerate(parts[:-1]):
                if part in repo_names:
                    key=(part,'/'.join(parts[pos+1:]))
                    if key not in member_index or len(n)<len(member_index[key]):member_index[key]=n
        jobs=[];missing=0
        for item in inv:
            repo=item.get('Repository','').strip();rel=item.get('FilePath','').replace('\\','/').strip().lstrip('/')
            if not repo or not rel:continue
            if rel.startswith(repo+'/'):rel=rel[len(repo)+1:]
            if len(rel)>1 and rel[1]==':':continue
            member=member_index.get((repo,rel))
            if not member:missing+=1;continue
            jobs.append((repo,rel,member))
        print('ZIP source matches:',len(jobs),'missing:',missing,flush=True)
        # One persistent AST scanner rather than thousands of Node launches.
        scan_input=[]
        for i,(repo,rel,member) in enumerate(jobs):
            try:source=z.read(member).decode('utf-8-sig')
            except (UnicodeError,RuntimeError):continue
            scan_input.append(json.dumps({'id':i,'file':rel,'source':source},ensure_ascii=False))
        scan=subprocess.run(['node',str(worker),'scan'],input='\n'.join(scan_input)+'\n',text=True,capture_output=True,cwd=ROOT)
        if scan.returncode:raise RuntimeError('AST scanner failed: '+scan.stderr[-1000:])
        found=[]
        for line in scan.stdout.splitlines():
            try:r=json.loads(line)
            except json.JSONDecodeError:continue
            if r.get('match') and isinstance(r.get('id'),int):
                repo,rel,member=jobs[r['id']];m=r['match'];found.append({'Repository':repo,'RelativePath':rel,'FunctionName':m['name'],'Pattern':m['pattern'],'Parameter':m['parameter'],'ZipMember':member})
        writecsv(eligible_path,['Repository','RelativePath','FunctionName','Pattern','Parameter','ZipMember'],found)
        print('Conservatively matched functions in distinct files:',len(found),flush=True)
        print('Property patterns:',dict(Counter(r['Pattern'] for r in found)),flush=True)
        if a.limit==0:print('Scan-only mode: no tests executed. Eligible list:',eligible_path);return
        attempts=0;passed=failed=newblocked=0
        for c in found:
            if attempts>=a.limit:break
            # Source path uses the same extraction location as the existing pipeline, even if not yet extracted.
            full=str((ROOT/'pilot-repositories'/c['Repository']/c['RelativePath']).resolve())
            key=(full.replace('\\','/'),c['FunctionName'])
            if key in done or key in blocked_done:continue
            attempts+=1
            with tempfile.TemporaryDirectory() as td:
                src=Path(td)/('source.tsx' if c['RelativePath'].endswith('.tsx') else 'source.ts')
                src.write_bytes(z.read(c['ZipMember']))
                job={'sourceFile':str(src),'fullPath':full,'functionName':c['FunctionName'],'pattern':c['Pattern'],'parameter':c['Parameter'],'runs':a.runs}
                jf=Path(td)/'job.json';jf.write_text(json.dumps(job),encoding='utf-8')
                try:
                    proc=subprocess.run(['node',str(worker),'test',str(jf)],cwd=ROOT,capture_output=True,text=True,timeout=a.timeout)
                    if proc.returncode:raise RuntimeError((proc.stderr or proc.stdout).splitlines()[-1][:400])
                    obj=json.loads(proc.stdout);row=obj['row']
                    if row['Status'] not in ('Passed','Failed'):raise RuntimeError('Invalid status')
                    results.append(row);writecsv(results_path,COLUMNS,results);done.add(key)
                    if row['Status']=='Passed':passed+=1
                    else:failed+=1
                    print(row['Status'].upper(),c['Repository'],c['RelativePath'],c['FunctionName'],flush=True)
                except (subprocess.TimeoutExpired,Exception) as e:
                    reason='Timed out' if isinstance(e,subprocess.TimeoutExpired) else str(e)
                    blocked.append({'Repository':c['Repository'],'FilePath':full,'FunctionName':c['FunctionName'],'Reason':reason})
                    writecsv(blocked_path,['Repository','FilePath','FunctionName','Reason'],blocked);blocked_done.add(key);newblocked+=1
                    print('BLOCKED',c['Repository'],c['RelativePath'],reason[:100],flush=True)
        print(f'New actual tests: {passed} passed, {failed} failed; {newblocked} blocked; {attempts} attempted')
        print('Results:',results_path,'Eligible:',eligible_path,'Blocked:',blocked_path)
        print('Re-run with a higher --limit to continue; existing results are skipped.')
if __name__=='__main__':main()
