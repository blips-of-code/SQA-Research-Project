
import csv
import json
import zipfile
from pathlib import Path

base = Path.home() / "Documents" / "SQA-Research"
archive = Path.home() / "Downloads" / "yzz0229-VSCODE-DATA.zip"

names = set(
    (base / "qualifying-with-package.txt").read_text(
        encoding="utf-8"
    ).splitlines()
)

results = []

with zipfile.ZipFile(archive) as z:
    for repo in sorted(names):
        package_path = f"{repo}/package.json"

        try:
            package = json.loads(z.read(package_path))
            scripts = package.get("scripts", {})
            if not isinstance(scripts, dict):
                scripts = {}

            engines = package.get("engines", {})
            if not isinstance(engines, dict):
                engines = {}

            results.append({
                "Repository": repo,
                "VSCodeExtension": "Yes" if "vscode" in engines else "No",
                "MainEntry": package.get("main", ""),
                "BrowserEntry": package.get("browser", ""),
                "BuildScripts": "; ".join(
                    f"{key}: {value}"
                    for key, value in scripts.items()
                    if any(word in key.lower()
                           for word in ("build", "compile", "prepublish"))
                ),
                "Status": "Not tested",
                "Error": ""
            })

        except (KeyError, ValueError, UnicodeDecodeError) as error:
            results.append({
                "Repository": repo,
                "VSCodeExtension": "Unknown",
                "MainEntry": "",
                "BrowserEntry": "",
                "BuildScripts": "",
                "Status": "Inspection failed",
                "Error": str(error)
            })

output = base / "executability-screening.csv"

with output.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=[
        "Repository", "VSCodeExtension", "MainEntry",
        "BrowserEntry", "BuildScripts", "Status", "Error"
    ])
    writer.writeheader()
    writer.writerows(results)

print(f"Inspected {len(results)} repositories.")
print(f"Results saved to: {output}")
print("Note: No repositories have been executed by this script.")

