"""Batch build screening for VS Code extensions. Run with --batch-size 10."""
import argparse
import csv
import json
import os
import subprocess
import tempfile
import uuid
import zipfile
from pathlib import Path

BASE = Path.home() / 'Documents' / 'SQA-Research'
ARCHIVE = Path.home() / 'Downloads' / 'yzz0229-VSCODE-DATA.zip'
CANDIDATES = BASE / 'qualifying-with-package.txt'
RESULTS = BASE / 'build-results.csv'
IMAGE = 'node:20-bookworm'
FIELDS = ['Repository', 'PackageManager', 'BuildCommand', 'InstallStatus', 'BuildStatus', 'EntryPointExists', 'ExecutionStatus', 'Error']
LABEL = 'sqa-research-build-checker'


def run(args, timeout=300):
    return subprocess.run(args, capture_output=True, text=True, errors='replace', timeout=timeout)


def docker_run(mounts, command, *, network=False, timeout=300, workdir=None):
    """Track container ID and forcibly remove a timed-out container."""
    with tempfile.TemporaryDirectory(prefix='sqa-docker-') as tmp:
        cidfile = Path(tmp) / 'cid'
        args = ['docker', 'run', '--rm', '--cidfile', str(cidfile),
                '--label', LABEL + '=true', '--memory', '2g', '--cpus', '2',
                '--pids-limit', '256', '--security-opt', 'no-new-privileges',
                '--cap-drop', 'ALL']
        if not network:
            args += ['--network', 'none']
        for mount in mounts:
            args += ['--mount', mount]
        if workdir:
            args += ['-w', workdir]
        args += [IMAGE, 'bash', '-c', command]
        try:
            return run(args, timeout=timeout)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            # The Docker CLI can time out while its container keeps running.
            # Remove only the container created by this exact invocation.
            if cidfile.exists():
                cid = cidfile.read_text(encoding='utf-8').strip()
                if cid:
                    try:
                        run(['docker', 'rm', '-f', cid], timeout=35)
                    except subprocess.TimeoutExpired:
                        print('WARNING: Docker cleanup timed out for container', cid, flush=True)
            raise


def extract(archive, repo, dest):
    prefix = repo + '/'
    for member in archive.infolist():
        if not member.filename.startswith(prefix) or member.is_dir():
            continue
        relative = Path(member.filename[len(prefix):])
        if not relative.parts or relative.is_absolute() or '..' in relative.parts or '.git' in relative.parts or 'node_modules' in relative.parts:
            continue
        target = dest / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.read(member))


def commands(package, workspace):
    scripts = package.get('scripts') or {}
    if (workspace / 'yarn.lock').exists():
        manager, install, prefix = 'yarn', 'corepack yarn install --ignore-scripts --non-interactive', 'corepack yarn'
    elif (workspace / 'package-lock.json').exists():
        manager, install, prefix = 'npm', 'npm ci --ignore-scripts --no-audit --no-fund', 'npm run'
    else:
        manager, install, prefix = 'npm', 'npm install --ignore-scripts --no-audit --no-fund', 'npm run'
    build = next((f'{prefix} {name}' for name in ('compile', 'build', 'vscode:prepublish') if name in scripts), '')
    return manager, install, build


def save(rows):
    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    temp = RESULTS.with_suffix('.csv.tmp')
    with temp.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    os.replace(temp, RESULTS)


def process(archive, repo):
    row = dict.fromkeys(FIELDS, '')
    row.update(Repository=repo, InstallStatus='Not attempted', BuildStatus='Not attempted', EntryPointExists='Not checked', ExecutionStatus='Not tested')
    volume = None
    try:
        with tempfile.TemporaryDirectory() as temp:
            workspace = Path(temp) / 'repository'
            workspace.mkdir()
            extract(archive, repo, workspace)
            package = json.loads((workspace / 'package.json').read_text(encoding='utf-8'))
            manager, install_cmd, build_cmd = commands(package, workspace)
            row.update(PackageManager=manager, BuildCommand=build_cmd)
            if not build_cmd:
                row['BuildStatus'] = 'No recognized build script'
                return row
            created = run(['docker', 'volume', 'create', '--label', LABEL + '=true'], timeout=30)
            if created.returncode:
                raise RuntimeError(created.stderr)
            volume = created.stdout.strip()
            copy_mounts = [f'type=bind,source={workspace.resolve()},target=/source,readonly',
                           f'type=volume,source={volume},target=/workspace']
            copied = docker_run(copy_mounts, 'cp -a /source/. /workspace/', timeout=120)
            if copied.returncode:
                raise RuntimeError((copied.stdout + copied.stderr)[-1500:])
            mounts = [f'type=volume,source={volume},target=/workspace']
            installed = docker_run(mounts, install_cmd, network=True, timeout=300, workdir='/workspace')
            if installed.returncode:
                row['InstallStatus'] = 'Failed'
                row['Error'] = (installed.stdout + installed.stderr)[-1500:]
                return row
            row['InstallStatus'] = 'Success'
            # Some legitimate build scripts fetch dependencies. Network is enabled
            # but the container retains resource limits and dropped capabilities.
            built = docker_run(mounts, build_cmd, network=True, timeout=180, workdir='/workspace')
            row['BuildStatus'] = 'Success' if built.returncode == 0 else 'Failed'
            if built.returncode:
                row['Error'] = (built.stdout + built.stderr)[-1500:]
            entry = package.get('main') or package.get('browser')
            if entry:
                node_code = "const fs=require('fs');const p=process.argv[1];process.exit([p,p+'.js'].some(x=>fs.existsSync(x)&&fs.statSync(x).isFile())?0:1)"
                check = docker_run(mounts, 'node -e ' + json.dumps(node_code) + ' ' + json.dumps(entry), timeout=30, workdir='/workspace')
                row['EntryPointExists'] = 'Yes' if check.returncode == 0 else 'No'
            else:
                row['EntryPointExists'] = 'Not declared'
    except subprocess.TimeoutExpired:
        row['BuildStatus'] = 'Timed out'
        row['Error'] = 'Docker operation exceeded timeout (container cleanup attempted)'
    except KeyboardInterrupt:
        print('\nInterrupted. Removing current container and volume; completed results remain saved.', flush=True)
        raise
    except Exception as exc:
        row['BuildStatus'] = 'Error'
        row['Error'] = str(exc)
    finally:
        if volume:
            try:
                removed = run(['docker', 'volume', 'rm', volume], timeout=60)
                if removed.returncode:
                    print('WARNING: temporary volume not removed:', volume, removed.stderr.strip()[-250:], flush=True)
            except subprocess.TimeoutExpired:
                print('WARNING: volume cleanup timed out:', volume, flush=True)
    return row


def retryable(row):
    error = row.get('Error', '')
    return row.get('BuildStatus') == 'Timed out' or (
        row.get('BuildStatus') == 'Failed' and
        any(s in error for s in ('EAI_AGAIN', 'ENOTFOUND', 'registry.npmjs.org', 'getaddrinfo'))
    )


def main():
    parser = argparse.ArgumentParser(description='Build-check repositories in resumable batches')
    parser.add_argument('--batch-size', type=int, default=10)
    parser.add_argument('--retry-checker-failures', action='store_true', help='Retry previously recorded timeouts and npm network failures')
    args = parser.parse_args()
    if args.batch_size < 1:
        parser.error('--batch-size must be at least 1')
    candidates = list(dict.fromkeys(x.strip() for x in CANDIDATES.read_text(encoding='utf-8-sig').splitlines() if x.strip()))
    existing = {}
    if RESULTS.exists():
        with RESULTS.open(newline='', encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                if row.get('Repository'):
                    existing[row['Repository']] = {field: row.get(field, '') for field in FIELDS}
    pending = [r for r in candidates if r not in existing or (args.retry_checker_failures and retryable(existing[r]))]
    selected = pending[:args.batch_size]
    print(f'{len(candidates)} candidates; {len(existing)} recorded; {len(pending)} eligible this run; processing up to {len(selected)}', flush=True)
    if not selected:
        print('Nothing to process. Use --retry-checker-failures to revisit timeouts/network failures.')
        return
    with zipfile.ZipFile(ARCHIVE) as archive:
        for i, repo in enumerate(selected, 1):
            print(f'[{i}/{len(selected)}] {repo}', flush=True)
            row = process(archive, repo)
            existing[repo] = row
            save([existing[r] for r in candidates if r in existing])
            print(f"  Install={row['InstallStatus']} Build={row['BuildStatus']} Entry={row['EntryPointExists']}", flush=True)
            if row['Error']:
                print('  Error:', row['Error'][-240:].replace('\n', ' '), flush=True)
    print(f'Batch complete. Saved: {RESULTS}', flush=True)


if __name__ == '__main__':
    main()

