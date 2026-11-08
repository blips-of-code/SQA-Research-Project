#!/usr/bin/env python3
"""Batch classification + genuine fast-check tests; resumes from CSV outputs."""
import argparse,csv,json,subprocess,tempfile,zipfile
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parent.parent
SCRIPT=ROOT/'scripts'/'scale_worker.cjs'
COLS=['FilePath','TestCaseName','FunctionName','Status','ExpectedValue','ProvidedValue','ErrorMessage','FailureCategory','InputParamater']
CLASS_COLS=['Repository','FilePath','Classification','FunctionCount','SelectedFunction','PropertyPattern','Notes']
def read(path):
 if not path.exists():return []
 with path.open(newline='',encoding='utf-8-sig') as f:return list(csv.DictReader(f))
def write(path,cols,rows):
 tmp=path.with_suffix('.tmp')
 with tmp.open('w',newline='',encoding='utf-8') as f:
  w=csv.DictWriter(f,fieldnames=cols,extrasaction='ignore');w.writeheader();w.writerows(rows)
 tmp.replace(path)
def main():
 p=argparse.ArgumentParser()
 p.add_argument('--zip',default=str(Path.home()/'Downloads'/'yzz0229-VSCODE-DATA.zip'))
 p.add_argument('--scan-limit',type=int,default=500,help='New files to classify (0 = all remaining)')
 p.add_argument('--test-limit',type=int,default=25,help='New eligible files to test (0 = classify only)')
 p.add_argument('--runs',type=int,default=100)
 p.add_argument('--timeout',type=int,default=12)
 p.add_argument('--retry-blocked',action='store_true')
 a=p.parse_args()
 inv=read(ROOT/'typescript-files.csv')
 if not inv:p.error('Missing or empty typescript-files.csv')
 zpath=Path(a.zip)
 if not zpath.is_file():p.error('ZIP not found: '+str(zpath))
 classes_path=ROOT/'fast-check-scale-classification.csv'; classes=read(classes_path)
 seen={(x['Repository'],x['FilePath']) for x in classes}
 results_path=ROOT/'fast-check-results.csv';results=read(results_path)
 blocked_path=ROOT/'fast-check-scale-blocked.csv';blocked=read(blocked_path)
 done={x['FilePath'].replace('\\','/') for x in results}
 blocked_set={x['FilePath'].replace('\\','/') for x in blocked}
 with zipfile.ZipFile(zpath) as z:
  names={n.replace('\\','/'):n for n in z.namelist() if n.endswith(('.ts','.tsx'))}
  # Use exact trailing repo/path match to account for the ZIP's outer directory.
  suffix_index={}
  known_repos={item['Repository'] for item in inv}
  for n in names:
   parts=n.split('/')
   for i,part in enumerate(parts[:-1]):
    if part in known_repos:
     suffix_index.setdefault('/'.join(parts[i:]),n)
  pending=[]
  for item in inv:
   repo=item['Repository']; rel=item['FilePath'].replace('\\','/')
   if (repo,rel) in seen:continue
   pending.append((repo,rel))
  if a.scan_limit:pending=pending[:a.scan_limit]
  print('Previously classified:',len(classes),'new files selected:',len(pending),flush=True)
  for start in range(0,len(pending),60):
   batch=pending[start:start+60]; payload=[]; preliminary=[]
   for repo,rel in batch:
    member=suffix_index.get(repo+'/'+rel)
    if not member:
     matches=[n for n in names if n.endswith('/'+repo+'/'+rel)]
     member=matches[0] if matches else None
    if not member:
     preliminary.append({'Repository':repo,'FilePath':rel,'Classification':'SourceMissing','FunctionCount':'','SelectedFunction':'','PropertyPattern':'','Notes':'Not found in ZIP'});continue
    info=z.getinfo(names[member])
    if info.file_size>1000000:
     preliminary.append({'Repository':repo,'FilePath':rel,'Classification':'TooLarge','FunctionCount':'','SelectedFunction':'','PropertyPattern':'','Notes':str(info.file_size)+' bytes'});continue
    try:source=z.read(names[member]).decode('utf-8-sig')
    except UnicodeError:
     preliminary.append({'Repository':repo,'FilePath':rel,'Classification':'DecodeError','FunctionCount':'','SelectedFunction':'','PropertyPattern':'','Notes':'Could not decode UTF-8'});continue
    payload.append({'key':repo+'|||'+rel,'file':rel,'source':source})
   classes.extend(preliminary)
   if payload:
    with tempfile.TemporaryDirectory() as d:
     infile=Path(d)/'in.json';outfile=Path(d)/'out.json'
     infile.write_text(json.dumps(payload),encoding='utf-8')
     proc=subprocess.run(['node',str(SCRIPT),'scan',str(infile),str(outfile)],cwd=ROOT,capture_output=True,text=True,timeout=120)
     if proc.returncode or not outfile.exists():
      print('SCAN ERROR:',(proc.stderr or proc.stdout)[-1000:]);break
     for item in json.loads(outfile.read_text(encoding='utf-8')):
      repo,rel=item['key'].split('|||',1); e=item.get('eligible'); count=item['functionCount']
      category='PropertyReady' if e else ('NoNamedFunction' if count==0 else 'NeedsCustomProperty')
      classes.append({'Repository':repo,'FilePath':rel,'Classification':category,'FunctionCount':count,'SelectedFunction':e['name'] if e else '', 'PropertyPattern':e['pattern'] if e else '', 'Notes':'Parse diagnostics: '+str(item['parseErrors']) if item['parseErrors'] else ''})
   write(classes_path,CLASS_COLS,classes)
   print('Classified:',len(classes),'/',len(inv),flush=True)
  print('Classification totals:',dict(Counter(x['Classification'] for x in classes)),flush=True)
  if a.test_limit==0:
   print('Classification-only run.');return
  attempted=passed=failed=blocked_now=0
  for row in classes:
   if row['Classification']!='PropertyReady':continue
   repo,rel=row['Repository'],row['FilePath']
   full=str((ROOT/'pilot-repositories'/repo/rel).resolve())
   # Path may be in original ZIP, not extracted: this path is a stable report identifier.
   norm=full.replace('\\','/')
   if norm in done or (norm in blocked_set and not a.retry_blocked):continue
   if attempted>=a.test_limit:break
   attempted+=1
   member=suffix_index.get(repo+'/'+rel)
   if not member:
    matches=[n for n in names if n.endswith('/'+repo+'/'+rel)]
    member=matches[0] if matches else None
   try:
    if not member:raise RuntimeError('Source missing')
    source=z.read(names[member]).decode('utf-8-sig')
    with tempfile.TemporaryDirectory() as d:
     infile=Path(d)/'in.json';outfile=Path(d)/'out.json'
     # Rescan to recover AST offsets; avoids persisting huge source or offsets in CSV.
     scanfile=Path(d)/'scan.json';scanout=Path(d)/'scanout.json'
     scanfile.write_text(json.dumps([{'key':'k','file':rel,'source':source}]),encoding='utf-8')
     proc=subprocess.run(['node',str(SCRIPT),'scan',str(scanfile),str(scanout)],cwd=ROOT,capture_output=True,text=True,timeout=a.timeout)
     if proc.returncode:raise RuntimeError(proc.stderr[-500:])
     eligible=json.loads(scanout.read_text())[0]['eligible']
     if not eligible:raise RuntimeError('No longer eligible')
     infile.write_text(json.dumps({'source':source,'file':rel,'fullPath':full,'eligible':eligible,'runs':a.runs}),encoding='utf-8')
     proc=subprocess.run(['node',str(SCRIPT),'test',str(infile),str(outfile)],cwd=ROOT,capture_output=True,text=True,timeout=a.timeout)
     if proc.returncode or not outfile.exists():raise RuntimeError((proc.stderr or proc.stdout)[-500:])
     result=json.loads(outfile.read_text(encoding='utf-8'))
     results.extend(result['rows']);write(results_path,COLS,results);done.add(norm)
     if result['status']=='Passed':passed+=1
     else:failed+=1
     print(result['status'].upper(),repo,rel,eligible['name'],flush=True)
   except Exception as exc:
    blocked_now+=1;blocked.append({'FilePath':full,'FunctionName':row['SelectedFunction'],'Reason':str(exc)[:400]})
    write(blocked_path,['FilePath','FunctionName','Reason'],blocked);blocked_set.add(norm)
    print('BLOCKED',repo,rel,str(exc)[:120],flush=True)
  print(f'New attempts: {attempted}; passed: {passed}; failed: {failed}; blocked: {blocked_now}')
  print('Classification:',classes_path,'Results:',results_path,'Blocked:',blocked_path)
  print('Resume by running the same command again; already-classified and tested files are skipped.')
if __name__=='__main__':main()
