#!/usr/bin/env python3
"""Audit external imports in TypeScript files from the source ZIP."""

import argparse
import csv
import json
import re
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

IMPORT_PATTERN = re.compile(
    r"""(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]"""
)

def package_name(specifier):
    if specifier.startswith(('.', '/', '#', 'node:')):
        return None
    if specifier.startswith('@'):
        parts = specifier.split('/')
        return '/'.join(parts[:2]) if len(parts) >= 2 else specifier
    return specifier.split('/')[0]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        '--zip',
        default=str(Path.home() / 'Downloads' / 'yzz0229-VSCODE-DATA.zip')
    )
    parser.add_argument('--limit', type=int, default=0)
    args = parser.parse_args()

    with (ROOT / 'typescript-files.csv').open(
        encoding='utf-8-sig', newline=''
    ) as f:
        inventory = list(csv.DictReader(f))

    repos = {r['Repository'] for r in inventory}
    rows = []
    seen = set()

    with zipfile.ZipFile(args.zip) as archive:
        members = {}

        for member in archive.namelist():
            if not member.endswith(('.ts', '.tsx')):
                continue
            parts = member.replace('\\', '/').split('/')
            for i, part in enumerate(parts[:-1]):
                if part in repos:
                    members.setdefault('/'.join(parts[i:]), member)

        selected = inventory[:args.limit] if args.limit else inventory

        for item in selected:
            repo = item['Repository']
            rel = item['FilePath'].replace('\\', '/')
            member = members.get(repo + '/' + rel)
            if not member:
                continue

            source = archive.read(member).decode(
                'utf-8-sig', errors='replace'
            )

            for specifier in IMPORT_PATTERN.findall(source):
                package = package_name(specifier)
                if not package:
                    continue

                key = (repo, package)
                if key in seen:
                    continue
                seen.add(key)

                attempts = []
                for attempt in range(1, 4):
                    script = (
                        "try {"
                        "require.resolve(" + json.dumps(package) + ");"
                        "console.log('Resolved');"
                        "} catch(e) {"
                        "console.error(e.message);"
                        "process.exitCode=1;"
                        "}"
                    )
                    result = subprocess.run(
                        ['node', '-e', script],
                        cwd=ROOT,
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    attempts.append(
                        f"{attempt}:{'OK' if result.returncode == 0 else 'Missing'}"
                    )

                rows.append({
                    'Repository': repo,
                    'Package': package,
                    'Attempts': ';'.join(attempts),
                    'Result': (
                        'Resolved'
                        if attempts[-1].endswith('OK')
                        else 'NotResolvedInHarness'
                    )
                })

    output = ROOT / 'dependency-audit.csv'
    with output.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(
            f,
            fieldnames=['Repository', 'Package', 'Attempts', 'Result']
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"Audited {len(rows)} repository/package pairs.")
    print(f"Saved {output.name}")

if __name__ == '__main__':
    main()