#!/usr/bin/env python3
"""Verify selected TypeScript functions against literal expectations from repository tests.

Only static assertions of the form expect(importedFn(literals)).toBe/Equal(literal)
are accepted. Does not execute test files, guess expectations, or mutate broad CSVs.
"""
import argparse
import csv
import json
import subprocess
import tempfile
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / 'scripts'
RESULT_COLUMNS = ['FilePath', 'TestCaseName', 'FunctionName', 'Status',
                  'ExpectedValue', 'ProvidedValue', 'ErrorMessage',
                  'FailureCategory', 'InputParamater', 'Repository',
                  'SourceFile', 'FunctionId', 'OracleSource', 'OracleLine',
                  'OracleType', 'Arguments']
CASE_COLUMNS = ['Repository', 'FilePath', 'FunctionName', 'Arguments',
                'ExpectedValue', 'OracleSource', 'OracleLine', 'Disposition']


def call_worker(script, mode, payload, timeout=30):
    with tempfile.TemporaryDirectory() as folder:
        inp, out = Path(folder) / 'in.json', Path(folder) / 'out.json'
        inp.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
        cmd = ['node', str(script), str(inp), str(out)]
        if mode:
            cmd.insert(2, mode)
        result = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, timeout=timeout)
        if result.returncode or not out.exists():
            raise RuntimeError((result.stderr or result.stdout or 'No worker output')[:600])
        return json.loads(out.read_text(encoding='utf-8'))


def load_csv(p):
    if not p.exists():
        return []
    with p.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def save_csv(p, cols, rows):
    temp = p.with_suffix('.tmp')
    with temp.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)
    temp.replace(p)


def key(c):
    return json.dumps([c['repo'], c['file'], c['fn'], c['args'], c['expected'],
                       c['oracleFile'], c['oracleLine']], sort_keys=True, ensure_ascii=False)


def canonical_json(v):
    return json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--zip', default=str(Path.home() / 'Downloads' / 'yzz0229-VSCODE-DATA.zip'))
    ap.add_argument('--limit', type=int, default=25, help='New oracle cases; 0 = all')
    ap.add_argument('--repos-dir', default='', help='Parent of extracted repos with installed dependencies')
    ap.add_argument('--timeout', type=int, default=30)
    ap.add_argument('--retry-context', action='store_true',
                    help='Retry only previous Exception/Blocked cases; replace their rows')
    args = ap.parse_args()

    inventory = load_csv(ROOT / 'typescript-files.csv')
    if not inventory:
        raise SystemExit('Missing typescript-files.csv')
    known = {(r['Repository'], r['FilePath'].replace('\\', '/')) for r in inventory}
    repos = {repo for repo, _ in known}
    tests, sources, members = [], {}, {}
    with zipfile.ZipFile(args.zip) as archive:
        for member in archive.namelist():
            parts = member.replace('\\', '/').split('/')
            match = next(((part, '/'.join(parts[i + 1:])) for i, part in enumerate(parts[:-1])
                          if part in repos), None)
            if not match:
                continue
            repo, rel = match
            if (repo, rel) in known and rel.endswith(('.ts', '.tsx')):
                members.setdefault((repo, rel), member)
            if not rel.endswith(('.ts', '.tsx', '.js', '.jsx')):
                continue
            sources.setdefault(repo, set()).add(rel)
            filename = rel.rsplit('/', 1)[-1].lower()
            segments = {p.lower() for p in rel.split('/')[:-1]}
            if not ('.test.' in filename or '.spec.' in filename or
                    segments.intersection({'test', 'tests', '__tests__'})):
                continue
            if archive.getinfo(member).file_size > 500_000:
                continue
            tests.append((repo, rel, member))

        batches = []
        for repo, rel, member in tests:
            batches.append({'repo': repo, 'path': rel,
                            'source': archive.read(member).decode('utf-8-sig', errors='replace'),
                            'sourcePaths': sorted(sources[repo])})
        # Chunk extraction to avoid very large Node JSON payloads.
        candidates = []
        for start in range(0, len(batches), 100):
            candidates.extend(call_worker(SCRIPTS / 'extract_test_oracles.cjs', None,
                                          {'tests': batches[start:start + 100]}, args.timeout))
        candidates = [c for c in candidates if (c['repo'], c['file']) in known]
        unique = {key(c): c for c in candidates}
        candidates = list(unique.values())
        conflicts = {}
        for c in candidates:
            k = (c['repo'], c['file'], c['fn'], canonical_json(c['args']))
            conflicts.setdefault(k, set()).add(canonical_json(c['expected']))
        # Conflicting source expectations must never produce a correctness verdict.
        candidates = [c for c in candidates if len(conflicts[(c['repo'], c['file'], c['fn'],
                                                                canonical_json(c['args']))]) == 1]
        result_path = ROOT / 'fast-check-verified-results.csv'
        cases_path = ROOT / 'fast-check-oracle-cases.csv'
        existing = load_csv(result_path)
        done = {(r['Repository'], r['SourceFile'], r['FunctionName'], r['Arguments'],
                 r['ExpectedValue'], r['OracleSource'], r['OracleLine']) for r in existing}
        retry_keys = {(r['Repository'], r['SourceFile'], r['FunctionName'], r['Arguments'],
                       r['ExpectedValue'], r['OracleSource'], r['OracleLine'])
                      for r in existing if r['Status'] in ('Exception', 'Blocked')}
        def candidate_key(c):
            return (c['repo'], c['file'], c['fn'], canonical_json(c['args']),
                    canonical_json(c['expected']), c['oracleFile'], str(c['oracleLine']))
        pending = [c for c in candidates if
                   candidate_key(c) in retry_keys] if args.retry_context else [
                   c for c in candidates if candidate_key(c) not in done]
        if args.limit:
            pending = pending[:args.limit]
        print(f'Found {len(candidates)} non-conflicting literal assertion cases; '
              f'{len(existing)} existing result rows; processing {len(pending)} new cases', flush=True)
        scanned = {}
        for index, c in enumerate(pending, 1):
            source_key = (c['repo'], c['file'])
            member = members.get(source_key)
            if not member:
                continue
            if source_key not in scanned:
                source = archive.read(member).decode('utf-8-sig', errors='replace')
                try:
                    scan = call_worker(SCRIPTS / 'broad_worker.cjs', 'scan',
                                       {'source': source, 'file': c['file']}, args.timeout)
                    scanned[source_key] = (source, scan['candidates'])
                except Exception as e:
                    scanned[source_key] = (source, [])
            source, functions = scanned[source_key]
            matches = [f for f in functions if f['name'] == c['fn']]
            outcome, actual, error, fid = 'Blocked', '', 'FunctionNotFoundOrAmbiguous', ''
            if len(matches) == 1:
                f = matches[0]
                fid = str(f['id'])
                try:
                    tested = call_worker(SCRIPTS / 'broad_worker.cjs', 'test', {
                        'source': source, 'file': c['file'], 'meta': f,
                        'inputs': [c['args']], 'runs': 1,
                        'repoDir': str(Path(args.repos_dir) / c['repo']) if args.repos_dir else ''
                    }, args.timeout)
                    obs = tested['observations'][0]
                    outcome, actual, error = obs['outcome'], obs['value'], obs['error']
                except Exception as e:
                    outcome, error = 'Blocked', str(e)[:600]
            if outcome == 'Returned':
                try:
                    match = canonical_json(json.loads(actual)) == canonical_json(c['expected'])
                    status = 'Passed' if match else 'Failed'
                    category = '' if match else 'VerifiedMismatch'
                except (ValueError, TypeError):
                    status, category = 'Unverified', 'NonJSONOutput'
            elif outcome == 'DependencyBlocked':
                status, category = 'Blocked', 'ExternalDependencyUnavailable'
            elif outcome == 'Exception':
                status, category = 'Exception', 'ExceptionNeedsReview'
            else:
                status, category = 'Blocked', 'HarnessOrFunctionUnavailable'
            case_key = (c['repo'], c['file'], c['fn'], canonical_json(c['args']),
                        canonical_json(c['expected']), c['oracleFile'], str(c['oracleLine']))
            if args.retry_context:
                existing = [r for r in existing if
                    (r['Repository'], r['SourceFile'], r['FunctionName'], r['Arguments'],
                     r['ExpectedValue'], r['OracleSource'], r['OracleLine']) != case_key]
            existing.append({
                'FilePath': str(Path(args.zip).resolve()) + '::' + member,
                'TestCaseName': f"Repository assertion {c['oracleFile']}:{c['oracleLine']}",
                'FunctionName': c['fn'], 'Status': status,
                'ExpectedValue': canonical_json(c['expected']), 'ProvidedValue': actual,
                'ErrorMessage': error, 'FailureCategory': category,
                'InputParamater': canonical_json(c['args']),
                'Repository': c['repo'], 'SourceFile': c['file'], 'FunctionId': fid,
                'OracleSource': c['oracleFile'], 'OracleLine': str(c['oracleLine']),
                'OracleType': 'RepositoryLiteralAssertion', 'Arguments': canonical_json(c['args'])
            })
            save_csv(result_path, RESULT_COLUMNS, existing)
            if index % 10 == 0 or index == len(pending):
                print(f'{index}/{len(pending)} verified attempts; statuses: '
                      f'{dict(Counter(r["Status"] for r in existing))}', flush=True)
        case_rows = []
        for c in candidates:
            case_rows.append({'Repository': c['repo'], 'FilePath': c['file'],
                              'FunctionName': c['fn'], 'Arguments': canonical_json(c['args']),
                              'ExpectedValue': canonical_json(c['expected']),
                              'OracleSource': c['oracleFile'], 'OracleLine': c['oracleLine'],
                              'Disposition': 'Static literal assertion; extracted, not independently validated'})
        save_csv(cases_path, CASE_COLUMNS, case_rows)
        print('Saved fast-check-verified-results.csv and fast-check-oracle-cases.csv')


if __name__ == '__main__':
    main()
