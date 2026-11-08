import argparse
import csv
import json
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZIP = Path.home() / 'Downloads' / 'yzz0229-VSCODE-DATA.zip'
FILES = ROOT / 'typescript-files.csv'
OUT = ROOT / 'typescript-function-inventory.csv'
JS = Path(__file__).with_name('inventory_functions.js')
FIELDS = ['Repository','FilePath','FunctionName','Kind','Line','Parameters','ReturnType','Exported','ParseError']

parser = argparse.ArgumentParser()
parser.add_argument('--batch-size',type=int,default=250)
parser.add_argument('--max-batches',type=int,default=0,help='0 means run all remaining batches')
args = parser.parse_args()
if args.batch_size < 1: parser.error('batch-size must be positive')
if not ZIP.exists(): raise SystemExit(f'ZIP not found: {ZIP}')
with FILES.open(encoding='utf-8-sig',newline='') as f: todo=list(csv.DictReader(f))
completed=set()
if OUT.exists():
    with OUT.open(encoding='utf-8-sig',newline='') as f:
        for row in csv.DictReader(f): completed.add((row['Repository'],row['FilePath']))
todo=[r for r in todo if (r['Repository'],r['FilePath']) not in completed]
print(f'{len(completed)} files already completed; {len(todo)} remaining',flush=True)
if not todo: raise SystemExit(0)
if not JS.exists(): raise SystemExit(f'Missing {JS}')
with zipfile.ZipFile(ZIP) as archive:
    names=set(archive.namelist())
    for batch_number,start in enumerate(range(0,len(todo),args.batch_size),1):
        if args.max_batches and batch_number>args.max_batches: break
        batch=todo[start:start+args.batch_size]
        with tempfile.TemporaryDirectory(prefix='sqa_ts_') as tmp:
            tmp=Path(tmp)
            manifest=[]
            missing=[]
            for idx,r in enumerate(batch):
                repo,path=r['Repository'],r['FilePath']
                zip_name=f'{repo}/{path}'
                if zip_name not in names:
                    missing.append(dict(Repository=repo,FilePath=path,FunctionName='',Kind='',Line='',Parameters='',ReturnType='',Exported='',ParseError='Not found in ZIP'))
                    continue
                local=tmp/f'{idx}{Path(path).suffix}'
                local.write_bytes(archive.read(zip_name))
                manifest.append({'repo':repo,'path':path,'local':str(local)})
            manifest_file=tmp/'manifest.json'
            manifest_file.write_text(json.dumps(manifest),encoding='utf-8')
            result=subprocess.run(['node',str(JS),str(manifest_file)],cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
            if result.returncode:
                raise SystemExit(f'Node parser failed; no rows saved for this batch:\n{result.stderr[:3000]}')
            rows=json.loads(result.stdout)+missing
            if len({(r['Repository'],r['FilePath']) for r in rows}) != len(batch):
                raise SystemExit('Unexpected missing or duplicate files in batch output; stopped without saving batch')
            exists=OUT.exists()
            with OUT.open('a',encoding='utf-8',newline='') as f:
                writer=csv.DictWriter(f,fieldnames=FIELDS)
                if not exists: writer.writeheader()
                writer.writerows(rows)
            print(f'Batch {batch_number}: saved {len(batch)} files, {len(rows)} inventory rows; {max(0,len(todo)-start-len(batch))} remaining',flush=True)
print(f'Finished this run. Output: {OUT}',flush=True)
