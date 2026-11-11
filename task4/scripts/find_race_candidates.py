import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

INVENTORY = ROOT / "typescript-function-inventory.csv"
OUTPUT = ROOT / "task4" / "results" / "race_candidates.csv"

MUTATION_HINTS = [
    "update",
    "write",
    "save",
    "set",
    "add",
    "remove",
    "delete",
    "insert",
    "push",
    "cache",
    "queue",
    "sync",
    "refresh",
    "store",
    "put",
    "append",
    "replace",
    "modify",
]

EXCLUDED_PATH_PARTS = [
    "/test/",
    "/tests/",
    "test/",
    "tests/",
    "__tests__",
    "/spec/",
    "fixtures",
    "mocks",
    "examples",
]


def is_candidate(row):
    function_name = (row.get("FunctionName") or "").lower()
    return_type = (row.get("ReturnType") or "").lower()
    file_path = (row.get("FilePath") or "").lower()
    exported = (row.get("Exported") or "").lower()

    # Must be asynchronous
    if "promise" not in return_type:
        return False

    # Prefer functions that appear to mutate/write state
    if not any(word in function_name for word in MUTATION_HINTS):
        return False

    # Avoid tests, mocks, examples, etc.
    if any(part in file_path for part in EXCLUDED_PATH_PARTS):
        return False

    # Easier to test from outside the module
    if exported != "yes":
        return False

    return True


def score(row):
    function_name = (row.get("FunctionName") or "").lower()
    return_type = (row.get("ReturnType") or "").lower()

    points = 0

    if "promise<void>" in return_type:
        points += 3
    elif "promise" in return_type:
        points += 2

    for word in MUTATION_HINTS:
        if word in function_name:
            points += 2

    if any(word in function_name for word in [
        "write",
        "save",
        "update",
        "delete",
        "set",
        "store",
        "push",
        "append",
    ]):
        points += 2

    return points


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    candidates = []

    with INVENTORY.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            if is_candidate(row):
                row["RaceCandidateScore"] = score(row)
                candidates.append(row)

    candidates.sort(
        key=lambda row: int(row["RaceCandidateScore"]),
        reverse=True
    )

    fields = [
        "Repository",
        "FilePath",
        "FunctionName",
        "Kind",
        "Line",
        "Parameters",
        "ReturnType",
        "Exported",
        "ParseError",
        "RaceCandidateScore",
    ]

    with OUTPUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()

        for row in candidates:
            writer.writerow({field: row.get(field, "") for field in fields})

    print(f"Found {len(candidates)} strong race-condition candidates")
    print(f"Saved results to: {OUTPUT}")


if __name__ == "__main__":
    main()
