import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

INVENTORY = ROOT / "typescript-function-inventory.csv"
OUTPUT = ROOT / "task4" / "results" / "race_candidates.csv"

NAME_HINTS = [
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
    "state",
    "sync",
    "refresh",
    "load",
]


def score(row):
    points = 0

    function_name = (row.get("FunctionName") or "").lower()
    return_type = (row.get("ReturnType") or "").lower()

    if "promise" in return_type:
        points += 4

    if any(word in function_name for word in NAME_HINTS):
        points += 2

    if row.get("Exported") == "Yes":
        points += 1

    return points


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    candidates = []

    with INVENTORY.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            candidate_score = score(row)

            if candidate_score >= 4:
                row["RaceCandidateScore"] = candidate_score
                candidates.append(row)

    candidates.sort(
        key=lambda row: int(row["RaceCandidateScore"]),
        reverse=True
    )

    if not candidates:
        print("No candidates found.")
        return

    fields = list(candidates[0].keys())

    with OUTPUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(candidates)

    print(f"Found {len(candidates)} race-condition candidates")
    print(f"Saved results to: {OUTPUT}")


if __name__ == "__main__":
    main()

