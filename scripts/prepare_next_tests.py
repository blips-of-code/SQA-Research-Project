#!/usr/bin/env python3
"""Create a prioritized SQL Formatter testing queue from existing inventory.
Does not claim a candidate has been tested.
"""
import csv
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = 'sql-formatter-org-sql-formatter'
INV = ROOT / 'typescript-function-inventory.csv'
OUT = ROOT / 'sql-formatter-next-test-queue.csv'
EXISTING = {('src/lexer/regexUtil.ts', 'escapeRegExp'), ('src/lexer/lineColFromIndex.ts', 'lineColFromIndex'), ('src/utils.ts', 'dedupe'), ('src/expandPhrases.ts', 'expandPhrases')}

with INV.open(newline='', encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))
if not rows:
    raise SystemExit('Inventory is empty')
required = {'Repository', 'FilePath', 'FunctionName', 'Kind', 'Parameters', 'Exported'}
missing = required - set(rows[0])
if missing:
    raise SystemExit(f'Inventory columns missing: {sorted(missing)}')

by_file = defaultdict(list)
for r in rows:
    if r['Repository'] != REPO or not r['FunctionName'].strip():
        continue
    file = r['FilePath'].replace('\\', '/')
    prefix = REPO + '/'
    if file.startswith(prefix): file = file[len(prefix):]
    if (file, r['FunctionName']) in EXISTING: continue
    if r['Kind'] not in ('FunctionDeclaration', 'ArrowFunction', 'FunctionExpression'):
        continue
    by_file[file].append(r)

def score(r):
    # Triage only: an exported, simple-looking function is easier to test.
    params = r['Parameters'].strip()
    return (0 if r['Exported'] == 'Yes' else 1, params.count(',') if params else 0, len(params), len(r['FunctionName']))

output=[]
for file, candidates in sorted(by_file.items()):
    candidates.sort(key=score)
    best=candidates[0]
    output.append({'Repository':REPO,'FilePath':file,'FunctionName':best['FunctionName'],
                   'Kind':best['Kind'],'Parameters':best['Parameters'],
                   'Exported':best['Exported'], 'TestStatus':'NeedsProperty',
                   'Notes':'Candidate only; original function has NOT been tested'})

with OUT.open('w', newline='', encoding='utf-8-sig') as f:
    fields=['Repository','FilePath','FunctionName','Kind','Parameters','Exported','TestStatus','Notes']
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(output)
print('Created:', OUT)
print('Candidate files:',len(output))
print('Exported first-choice candidates:',sum(r['Exported']=='Yes' for r in output))
print('No tests were fabricated or marked as passed.')
print('\nFirst 15 candidates:')
for r in output[:15]:
    print(f"  {r['FilePath']} :: {r['FunctionName']} ({r['Parameters']})")
