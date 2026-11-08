#!/usr/bin/env python3
"""Read-only audit of existing SQA Task 3 CSV files; does not rerun tests."""
from pathlib import Path
import csv
from collections import Counter,defaultdict
ROOT=Path(__file__).resolve().parent.parent
def read(name):
 p=ROOT/name
 if not p.exists():
  print('MISSING:',name);return []
 with p.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def norm(s):return (s or '').replace('\\','/').lower()
inv=read('typescript-files.csv')
functions=read('typescript-function-inventory.csv')
classes=read('fast-check-scale-classification.csv')
results=read('fast-check-results.csv')
blocked=read('fast-check-scale-blocked.csv')
no_functions=set()
by_file=defaultdict(list)
for r in functions:by_file[(r.get('Repository',''),norm(r.get('FilePath','')))].append(r)
for key,rows in by_file.items():
 if not any((r.get('FunctionName') or '').strip() for r in rows):no_functions.add(key)
print('INVENTORY FILES:',len(inv))
print('FUNCTION INVENTORY FILES:',len(by_file))
print('NO DISCOVERED FUNCTIONS:',len(no_functions))
print('SCALE CLASSIFICATIONS:',dict(Counter(r.get('Classification','') for r in classes)))
misclassified=[]
for r in classes:
 if r.get('Classification')=='NoNamedFunction':
  key=(r.get('Repository',''),norm(r.get('FilePath','')))
  if key in by_file and key not in no_functions:misclassified.append(key)
print('SCALE NoNamedFunction BUT ORIGINAL INVENTORY HAS FUNCTIONS:',len(misclassified))
print('EXAMPLES:',*('  '+repo+' :: '+path for repo,path in misclassified[:8]),sep='\n')
statuses=Counter(r.get('Status','') for r in results)
unique_result_paths={norm(r.get('FilePath')) for r in results if r.get('Status') in ('Passed','Failed')}
print('RESULT PARAMETER ROWS:',len(results),'STATUS:',dict(statuses))
print('UNIQUE FILE PATHS WITH REAL RESULTS:',len(unique_result_paths))
print('SCALE BLOCKED:',len(blocked))
for r in blocked[:8]:print('  ',r.get('FunctionName',''),':',r.get('Reason','')[:220])
print('NOTE: NoNamedFunction means the narrow scanner missed a named declaration, NOT that a file has no functions.')
print('NOTE: Results count parameter rows; one function with two parameters may create two rows.')
