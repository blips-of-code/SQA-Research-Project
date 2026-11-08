#!/usr/bin/env python3
"""Resumable type-based robustness attempts; outputs separate from prior results."""
import argparse,csv,json,subprocess,tempfile,zipfile
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parent.parent
WORKER=ROOT/'scripts'/'broad_worker.cjs'
COLS=['FilePath','TestCaseName','FunctionName','Status','ExpectedValue','ProvidedValue','ErrorMessage','FailureCategory','InputParamater']
CLASS=['Repository','FilePath','Classification','FunctionCount','SelectedFunction','ParameterTypes','Notes']
BLOCK=['Repository','FilePath','FunctionName','Reason']
def read(p):
 if not p.exists():return []
 with p.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def save(p,cols,rows):
 t=p.with_suffix('.tmp')
 with t.open('w',encoding='utf-8',newline='') as f:
  w=csv.DictWriter(f,fieldnames=cols,extrasaction='ignore');w.writeheader();w.writerows(rows)
 t.replace(p)
def invoke(mode,job,timeout):
 with tempfile.TemporaryDirectory() as d:
  a=Path(d)/'in.json';b=Path(d)/'out.json';a.write_text(json.dumps(job),encoding='utf-8')
  p=subprocess.run(['node',str(WORKER),mode,str(a),str(b)],cwd=ROOT,capture_output=True,text=True,timeout=timeout)
  if p.returncode or not b.exists():raise RuntimeError((p.stderr or p.stdout or 'Worker returned no output')[:1200])
  return json.loads(b.read_text(encoding='utf-8'))
def main():
 p=argparse.ArgumentParser();p.add_argument('--zip',default=str(Path.home()/'Downloads'/'yzz0229-VSCODE-DATA.zip'));p.add_argument('--limit',type=int,default=250,help='New files to process; 0=all');p.add_argument('--runs',type=int,default=20);p.add_argument('--timeout',type=int,default=8);a=p.parse_args()
 inv=read(ROOT/'typescript-files.csv'); assert inv,'Missing typescript-files.csv'
 cp=ROOT/'fast-check-broad-classification.csv';rp=ROOT/'fast-check-broad-results.csv';bp=ROOT/'fast-check-broad-blocked.csv'
 classes=read(cp);results=read(rp);blocked=read(bp);seen={(x['Repository'],x['FilePath']) for x in classes}
 todo=[r for r in inv if (r['Repository'],r['FilePath']) not in seen];todo=todo[:a.limit] if a.limit else todo
 print('Already processed:',len(classes),'New files:',len(todo),flush=True)
 repos={r['Repository'] for r in inv}
 with zipfile.ZipFile(a.zip) as z:
  members={}
  for n in z.namelist():
   if not n.endswith(('.ts','.tsx')):continue
   parts=n.replace('\\','/').split('/')
   for i,v in enumerate(parts[:-1]):
    if v in repos:members.setdefault('/'.join(parts[i:]),n)
  for i,r in enumerate(todo,1):
   repo,rel=r['Repository'],r['FilePath'].replace('\\','/');member=members.get(repo+'/'+rel)
   record={'Repository':repo,'FilePath':rel,'Classification':'','FunctionCount':'','SelectedFunction':'','ParameterTypes':'','Notes':''}
   if not member:record['Classification']='SourceMissing'
   elif z.getinfo(member).file_size>1000000:record['Classification']='TooLarge'
   else:
    try:
     source=z.read(member).decode('utf-8-sig');scan=invoke('scan',{'source':source,'file':rel},a.timeout)
     record['FunctionCount']=scan['functionCount'];candidate=scan['eligible']
     if not candidate:
      record['Classification']='NoRecognizedFunction' if not scan['functionCount'] else 'UnsupportedSignatureOrMethod'
      record['Notes']=';'.join(sorted(set(x['reason'] for x in scan['candidates'] if x['reason'])))[:300]
     else:
      record['SelectedFunction']=candidate['name'];record['ParameterTypes']=';'.join(candidate['types']);record['Classification']='Attempted'
      # Report a ZIP member locator, not a nonexistent extracted file.
      full=str(Path(a.zip).resolve())+'::'+member
      try:
       result=invoke('test',{'source':source,'file':rel,'fullPath':full,'meta':candidate,'runs':a.runs},a.timeout)
       if result['status']=='EnvironmentBlocked':
        record['Classification']='ExecutionBlocked'
        record['Notes']='Missing execution environment: '+result['reason'][:350]
        blocked.append({'Repository':repo,'FilePath':rel,'FunctionName':candidate['name'],'Reason':result['reason'][:1200]})
        save(bp,BLOCK,blocked)
       else:
        results.append(result['row']);save(rp,COLS,results)
        record['Classification']='RobustnessPassed' if result['status']=='Passed' else 'RobustnessExceptionNeedsReview'
        record['Notes']='Generated input runs: '+str(result['runs'])
      except Exception as e:
       record['Classification']='ExecutionBlocked';record['Notes']=str(e)[:500]
       blocked.append({'Repository':repo,'FilePath':rel,'FunctionName':candidate['name'],'Reason':str(e)[:1200]});save(bp,BLOCK,blocked)
    except Exception as e:record['Classification']='ScanBlocked';record['Notes']=str(e)[:500]
   classes.append(record);save(cp,CLASS,classes)
   if i%25==0 or i==len(todo):print(f'Processed {i}/{len(todo)}; total {len(classes)}/{len(inv)}; statuses {dict(Counter(x["Classification"] for x in classes))}',flush=True)
 print('Done. Results are in separate broad CSVs; previous results untouched.')
if __name__=='__main__':main()
