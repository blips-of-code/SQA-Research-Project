
#!/usr/bin/env python3
"""Exploratory per-function execution, resumable; does not certify correctness."""

import argparse
import csv
import json
import shutil
from datetime import datetime
import subprocess
import tempfile
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKER = ROOT / 'scripts' / 'broad_worker.cjs'

RESULT_COLS = [
    'FilePath', 'TestCaseName', 'FunctionName', 'Status',
    'ExpectedValue', 'ProvidedValue', 'ErrorMessage',
    'FailureCategory', 'InputParamater'
]

CLASS_COLS = [
    'Repository', 'FilePath', 'FunctionId',
    'FunctionName', 'Classification', 'Notes'
]

DEPENDENCY_COLS = ['Repository', 'FilePath', 'FunctionId', 'FunctionName', 'Run', 'Package', 'Binding', 'Attempt', 'Result']

BLOCK_COLS = [
    'Repository', 'FilePath', 'FunctionId',
    'FunctionName', 'Reason', 'DependencyAttempts'
]


def read(path):
    if not path.exists():
        return []
    with path.open(encoding='utf-8-sig', newline='') as handle:
        return list(csv.DictReader(handle))


def save(path, cols, rows):
    temp = path.with_suffix('.tmp')
    with temp.open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(
            handle, fieldnames=cols, extrasaction='ignore'
        )
        writer.writeheader()
        writer.writerows(rows)
    temp.replace(path)


def invoke(mode, job, timeout):
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / 'input.json'
        output = Path(folder) / 'output.json'

        source.write_text(json.dumps(job), encoding='utf-8')

        proc = subprocess.run(
            ['node', str(WORKER), mode, str(source), str(output)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout
        )

        if proc.returncode or not output.exists():
            raise RuntimeError(
                (proc.stderr or proc.stdout or 'No worker output')[:1000]
            )

        return json.loads(output.read_text(encoding='utf-8'))


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        '--zip',
        default=str(
            Path.home() / 'Downloads' / 'yzz0229-VSCODE-DATA.zip'
        )
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=10,
        help='Number of new files; 0 means all'
    )
    parser.add_argument('--rerun-completed', action='store_true',
                        help='Reprocess previously completed eligible files, replacing old rows safely')
    parser.add_argument('--runs', type=int, default=10)
    parser.add_argument('--dry-run', action='store_true',
                        help='Show eligible and remaining counts without executing tests')
    parser.add_argument('--oracles', default='', help='Optional JSON mapping repository/file/function/input to expected output')
    parser.add_argument('--repos-dir', default='', help='Optional directory containing extracted repository folders with installed node_modules')
    parser.add_argument('--timeout', type=int, default=15)
    parser.add_argument('--function-inventory', default='',
                        help='Task 2 CSV containing Repository, FilePath, FunctionName, Kind')

    args = parser.parse_args()
    oracle_data = {}
    if args.oracles:
        oracle_data = json.loads(Path(args.oracles).read_text(encoding='utf-8'))


    inventory = read(ROOT / 'typescript-files.csv')

    if not inventory:
        raise SystemExit(
            'Missing typescript-files.csv in repository root'
        )

    # Exclude only files explicitly marked function-free by the Task 2 AST inventory.
    # The Task 2 scanner recognizes methods, constructors, accessors, and arrows,
    # even when the broad execution scanner cannot execute those functions.
    candidates = [ROOT / name for name in (
        'typescript-function-inventory.csv',
        'typescript-functions.csv',
        'function-inventory.csv',
    )]
    if args.function_inventory:
        function_path = Path(args.function_inventory).expanduser().resolve()
    else:
        function_path = next((path for path in candidates if path.exists()), None)
    if function_path is None or not function_path.exists():
        raise SystemExit(
            'Task 2 function inventory not found. Supply '
            '--function-inventory PATH_TO_YOUR_FUNCTION_INVENTORY.csv; '
            'no files have been changed.'
        )
    function_rows = read(function_path)
    required = {'Repository', 'FilePath', 'FunctionName', 'Kind'}
    if not function_rows or not required.issubset(function_rows[0]):
        raise SystemExit('Function inventory is empty or missing required columns: '
                         + ', '.join(sorted(required)))

    def key(row):
        return (row['Repository'].strip(), row['FilePath'].replace('\\', '/').strip())

    # Files with an AST-recognized function-like declaration are eligible.
    # A blank function name AND kind denotes a function-free inventory row.
    has_function = {key(row) for row in function_rows
                    if row['FunctionName'].strip() or row['Kind'].strip()}
    inventoried = {key(row) for row in function_rows}
    unknown = {key(row) for row in inventory} - inventoried
    if unknown:
        examples = ', '.join(f'{r}/{f}' for r, f in sorted(unknown)[:3])
        raise SystemExit(f'{len(unknown)} source files absent from the function inventory '
                         f'(examples: {examples}). Refusing to silently skip them.')
    total_source = len(inventory)
    inventory = [row for row in inventory if key(row) in has_function]
    print(f'Task 2 function inventory: {function_path.name}; '
          f'eligible: {len(inventory)}; excluded function-free: '
          f'{total_source - len(inventory)}', flush=True)

    # Separate outputs preserve previous broad testing data.
    results_path = ROOT / 'fast-check-review-results.csv'
    classes_path = ROOT / 'fast-check-review-classification.csv'
    blocked_path = ROOT / 'fast-check-review-blocked.csv'
    dependencies_path = ROOT / 'fast-check-review-dependencies.csv'

    results = read(results_path)
    classes = read(classes_path)
    blocked = read(blocked_path)
    dependencies = read(dependencies_path)

    # File-level resume: only mark a file done after
    # every discovered candidate is classified.
    completed = {
        key(r)
        for r in classes
        if r['FunctionId'] == '__FILE_COMPLETE__'
    }

    todo = [
        r for r in inventory
        if (key(r) in completed if args.rerun_completed else key(r) not in completed)
    ]

    if args.limit < 0:
        raise SystemExit('--limit must be 0 or greater')
    if args.limit:
        todo = todo[:args.limit]

    print(
        f'Completed eligible files: {len(completed & {key(r) for r in inventory})}; '
        f'{"rerunning completed" if args.rerun_completed else "processing new"}: {len(todo)}',
        flush=True
    )

    if args.dry_run:
        return

    if args.rerun_completed and todo:
        # A snapshot of every output precedes the first replacement. Never overwrite it.
        backup_root = ROOT / 'task3-backups'
        stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        backup_dir = backup_root / f'before-rerun-{stamp}'
        backup_dir.mkdir(parents=True, exist_ok=False)
        for output in (results_path, classes_path, blocked_path, dependencies_path):
            if output.exists():
                shutil.copy2(output, backup_dir / output.name)
        print(f'Backed up existing CSVs to: {backup_dir}', flush=True)

    repos = {r['Repository'] for r in inventory}

    with zipfile.ZipFile(args.zip) as archive:
        members = {}

        for member in archive.namelist():
            if not member.endswith(('.ts', '.tsx')):
                continue

            parts = member.replace('\\', '/').split('/')

            for index, part in enumerate(parts[:-1]):
                if part in repos:
                    members.setdefault(
                        '/'.join(parts[index:]),
                        member
                    )

        for index, item in enumerate(todo, 1):
            repo = item['Repository']
            rel = item['FilePath'].replace('\\', '/')
            member = members.get(repo + '/' + rel)

            local_classes = []
            local_results = []
            local_blocked = []
            local_dependencies = []

            def classify(fid, name, status, notes=''):
                local_classes.append({
                    'Repository': repo,
                    'FilePath': rel,
                    'FunctionId': str(fid),
                    'FunctionName': name,
                    'Classification': status,
                    'Notes': notes[:1000]
                })

            def block(fid, name, reason):
                local_blocked.append({
                    'Repository': repo,
                    'FilePath': rel,
                    'FunctionId': str(fid),
                    'FunctionName': name,
                    'Reason': reason[:1000],
                    'DependencyAttempts': (
                        'Not applicable: no external import/use failure identified'
                    )
                })

            try:
                if not member:
                    classify(
                        '__FILE__', '', 'SourceMissing'
                    )

                elif archive.getinfo(member).file_size > 1_000_000:
                    classify(
                        '__FILE__', '', 'TooLarge'
                    )

                else:
                    source = archive.read(member).decode('utf-8-sig')

                    scan = invoke(
                        'scan',
                        {'source': source, 'file': rel},
                        args.timeout
                    )

                    if not scan['candidates']:
                        classify(
                            '__FILE__',
                            '',
                            'NoRecognizedFunction',
                            'Verify scanner before treating as function-free'
                        )

                    full_path = (
                        str(Path(args.zip).resolve())
                        + '::'
                        + member
                    )

                    for candidate in scan['candidates']:
                        fid = candidate['id']
                        name = candidate['name']

                        if candidate['reason']:
                            classify(
                                fid,
                                name,
                                'Unsupported',
                                candidate['reason']
                            )
                            block(
                                fid,
                                name,
                                candidate['reason']
                            )
                            continue

                        try:
                            tested = invoke(
                                'test',
                                {
                                    'source': source,
                                    'file': rel,
                                    'meta': candidate,
                                    'runs': args.runs,
                                    'repoDir': str(Path(args.repos_dir) / repo) if args.repos_dir else ''
                                },
                                args.timeout
                            )

                            if tested['classification'] != 'Executed':
                                classify(
                                    fid,
                                    name,
                                    'Blocked',
                                    tested.get('reason', '')
                                )
                                block(
                                    fid,
                                    name,
                                    tested.get('reason', '')
                                )
                                continue

                            for attempt in tested.get('dependencyAttempts', []):
                                local_dependencies.append({
                                    'Repository': repo, 'FilePath': rel,
                                    'FunctionId': str(fid), 'FunctionName': name,
                                    'Run': attempt['run'], 'Package': attempt['spec'],
                                    'Binding': attempt['binding'], 'Attempt': attempt['attempt'],
                                    'Result': attempt['result']
                                })

                            classify(
                                fid,
                                name,
                                'Executed',
                                f"{len(tested['observations'])} generated inputs"
                            )

                            for obs in tested['observations']:
                                if obs['outcome'] == 'DependencyBlocked':
                                    relevant = [a for a in tested.get('dependencyAttempts', [])
                                                if a['run'] == obs['run']]
                                    block(fid, name, obs['error'])
                                    local_blocked[-1]['DependencyAttempts'] = '; '.join(
                                        f"{a['attempt']}:{a['result']}" for a in relevant
                                    )[:1000]

                                # These are exploratory observations,
                                # NOT verified correctness verdicts.
                                oracle_key = json.dumps([repo, rel, name, obs['args']],
                                                        ensure_ascii=False, separators=(',', ':'))
                                has_oracle = oracle_key in oracle_data
                                expected = oracle_data.get(oracle_key)
                                verified = (has_oracle and obs['outcome'] == 'Returned'
                                            and obs['value'] == json.dumps(expected, ensure_ascii=False,
                                                                          separators=(',', ':')))
                                status = ('Passed' if verified else 'Failed' if has_oracle else
                                    'Observed'
                                    if obs['outcome'] == 'Returned'
                                    else 'Blocked' if obs['outcome'] == 'DependencyBlocked'
                                    else 'Exception'
                                )

                                params = (
                                    candidate['params']
                                    or ['(no parameters)']
                                )

                                for param_index, param in enumerate(params):
                                    value = (
                                        obs['args'][param_index]
                                        if candidate['params']
                                        else None
                                    )

                                    local_results.append({
                                        'FilePath': full_path,
                                        'TestCaseName': (
                                            f"Exploratory execution run "
                                            f"{obs['run']} "
                                            f"(NOT correctness verification)"
                                        ),
                                        'FunctionName': name,
                                        'Status': status,
                                        'ExpectedValue': (
                                            json.dumps(expected, ensure_ascii=False) if has_oracle else 'Not established; observed execution only'
                                        ),
                                        'ProvidedValue': (
                                            obs['value']
                                            if obs['outcome'] == 'Returned'
                                            else 'Exception'
                                        ),
                                        'ErrorMessage': obs['error'],
                                        'FailureCategory': (
                                            ('VerifiedMismatch' if has_oracle and not verified else
                                             'ExternalDependencyUnavailable' if obs['outcome'] == 'DependencyBlocked'
                                             else 'ExceptionNeedsReview' if obs['error'] else 'UnverifiedCorrectness')
                                        ),
                                        'InputParamater': (
                                            param
                                            + '='
                                            + json.dumps(value)
                                        )
                                    })

                        except Exception as exc:
                            classify(
                                fid,
                                name,
                                'Blocked',
                                str(exc)
                            )
                            block(
                                fid,
                                name,
                                str(exc)
                            )

                classify(
                    '__FILE_COMPLETE__',
                    '',
                    'Processed'
                )

            except Exception as exc:
                classify(
                    '__FILE__',
                    '',
                    'ScanBlocked',
                    str(exc)
                )
                block(
                    '__FILE__',
                    '',
                    str(exc)
                )
                classify(
                    '__FILE_COMPLETE__',
                    '',
                    'ProcessedWithError'
                )

            # Replace partial classification entries for this file.
            classes = [
                r for r in classes
                if (r['Repository'], r['FilePath']) != (repo, rel)
            ] + local_classes

            # Results do not carry Repository/FilePath columns. Match the
            # ZIP member suffix exactly, not just a function name or basename.
            # This also makes interrupted-file retries idempotent.
            suffix = '/' + repo + '/' + rel
            results = [r for r in results if not (
                '::' in r.get('FilePath', '') and
                (r['FilePath'].split('::', 1)[1].replace('\\', '/') == repo + '/' + rel or
                 r['FilePath'].split('::', 1)[1].replace('\\', '/').endswith(suffix))
            )] + local_results

            blocked = [
                r for r in blocked
                if (r['Repository'], r['FilePath']) != (repo, rel)
            ] + local_blocked

            dependencies = [r for r in dependencies if
                            (r['Repository'], r['FilePath']) != (repo, rel)] + local_dependencies
            save(dependencies_path, DEPENDENCY_COLS, dependencies)
            save(results_path, RESULT_COLS, results)
            save(blocked_path, BLOCK_COLS, blocked)
            save(classes_path, CLASS_COLS, classes)

            if index % 5 == 0 or index == len(todo):
                counts = Counter(
                    x['Classification'] for x in classes
                )
                print(
                    f'{index}/{len(todo)} {"rerun" if args.rerun_completed else "new"} files; '
                    f'classifications: {dict(counts)}',
                    flush=True
                )

    print(
        'Done. Review CSVs are exploratory; '
        'not final validated correctness results.'
    )


if __name__ == '__main__':
    main()
