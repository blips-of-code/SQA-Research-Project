#!/usr/bin/env python3
"""Correct legacy exploratory status labels without rerunning any functions.

Makes a timestamped backup and changes ONLY rows explicitly marked as lacking
an established expected value. Verified rows remain unchanged.
"""
import csv
import shutil
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
p = ROOT / 'fast-check-review-results.csv'
if not p.exists():
    raise SystemExit('No fast-check-review-results.csv found; nothing changed.')
with p.open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    columns = reader.fieldnames
    rows = list(reader)
changes = Counter()
for r in rows:
    expected = r.get('ExpectedValue', '')
    if 'Not established' not in expected and 'observed execution only' not in expected:
        continue
    if r.get('Status') == 'Passed':
        r['Status'] = 'Observed'
        if not r.get('FailureCategory'):
            r['FailureCategory'] = 'UnverifiedCorrectness'
        changes['Passed -> Observed'] += 1
    elif r.get('Status') == 'Failed':
        r['Status'] = 'Exception' if r.get('ErrorMessage') else 'Unverified'
        if r['Status'] == 'Exception':
            r['FailureCategory'] = 'ExceptionNeedsReview'
        changes['Failed -> ' + r['Status']] += 1
if not changes:
    print('No legacy rows need changes. CSV left untouched.')
else:
    backup = p.with_name(p.name + '.backup-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
    shutil.copy2(p, backup)
    temp = p.with_suffix('.tmp')
    with temp.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)
    temp.replace(p)
    print('Backup:', backup.name)
    print('Relabeled without rerunning:', dict(changes))
