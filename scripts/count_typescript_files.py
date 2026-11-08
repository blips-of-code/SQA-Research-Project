
import csv
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path.home() / "Documents" / "SQA-Research"
ZIP_PATH = Path.home() / "Downloads" / "yzz0229-VSCODE-DATA.zip"
RESULTS_PATH = ROOT / "build-results.csv"
OUTPUT_PATH = ROOT / "typescript-files.csv"

EXCLUDED_DIRS = {
    ".git", "node_modules", "dist", "out", "build",
    "coverage", ".vscode-test", ".next", ".yarn",
    "vendor", "target", "__pycache__"
}

with RESULTS_PATH.open(encoding="utf-8-sig", newline="") as f:
    results = list(csv.DictReader(f))

runnable = {
    row["Repository"]
    for row in results
    if row["BuildStatus"] == "Success"
    and row["InstallStatus"] == "Success"
}

files = []
counts = Counter()

with zipfile.ZipFile(ZIP_PATH) as archive:
    for item in archive.infolist():
        if item.is_dir():
            continue

        path = item.filename.replace("\\", "/")
        parts = path.split("/")

        if len(parts) < 2:
            continue

        repository = parts[0]

        if repository not in runnable:
            continue

        relative_parts = parts[1:]
        relative_path = "/".join(relative_parts)

        if any(part.lower() in EXCLUDED_DIRS for part in relative_parts[:-1]):
            continue

        filename = relative_parts[-1].lower()

        if not filename.endswith((".ts", ".tsx")):
            continue

        if filename.endswith((".d.ts", ".d.tsx", ".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")):
            continue

        files.append({
            "Repository": repository,
            "FilePath": relative_path,
            "SizeBytes": item.file_size
        })

        counts[repository] += 1

files.sort(key=lambda row: (row["Repository"].lower(), row["FilePath"].lower()))

with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(
        f,
        fieldnames=["Repository", "FilePath", "SizeBytes"]
    )
    writer.writeheader()
    writer.writerows(files)

print(f"Runnable repositories: {len(runnable)}")
print(f"Repositories with matching TypeScript files: {len(counts)}")
print(f"Total TypeScript source files: {len(files)}")
print(f"Saved: {OUTPUT_PATH}")

print("\nTop 15 repositories by TypeScript file count:")
for repository, count in counts.most_common(15):
    print(f"{count:5}  {repository}")

print("\nRunnable repositories with no matching files:")
for repository in sorted(runnable - counts.keys()):
    print(" ", repository)
