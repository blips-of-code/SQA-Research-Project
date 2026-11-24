#!/usr/bin/env python3
"""Combine existing verified results without rerunning tests."""

import csv
import argparse
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent

parser = argparse.ArgumentParser()
parser.add_argument("--initial", required=True, type=Path)
parser.add_argument(
    "--verified",
    type=Path,
    default=ROOT / "fast-check-verified-results.csv"
)
parser.add_argument(
    "--output",
    type=Path,
    default=ROOT / "fast-check-results.csv"
)
args = parser.parse_args()

columns = [
    "FilePath",
    "TestCaseName",
    "FunctionName",
    "Status",
    "ExpectedValue",
    "ProvidedValue",
    "ErrorMessage",
    "FailureCategory",
    "InputParamater"
]

rows = []

for source in [args.initial, args.verified]:
    with source.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row["Status"] in ("Passed", "Failed"):
                rows.append({
                    col: row.get(col, "") for col in columns
                })

with args.output.open("w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=columns)
    writer.writeheader()
    writer.writerows(rows)

print("Final CSV:", args.output)
print("Total records:", len(rows))
print("Statuses:", dict(Counter(r["Status"] for r in rows)))
