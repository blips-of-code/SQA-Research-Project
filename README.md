# SQA Research Project

## Project Overview

This repository contains our work for the Software Quality Assurance research project. The project involves identifying TypeScript repositories, checking whether they can be built, performing property-based testing, and investigating potential race conditions.

We are using Python, Node.js, TypeScript, and fast-check to automate parts of the analysis and testing process.

## Project Tasks

### Task 1: Repository Identification

Identify repositories that meet the project's TypeScript requirements.

**Status:** Initial repository identification completed.

Relevant files:
- `qualifying-repos.csv`
- `qualifying-repos-refined.csv`
- `package-repos.txt`

### Task 2: Repository Executability

Check whether the selected repositories can be built and identify those suitable for testing.

**Status:** Initial build screening completed.

Results:
- 299 qualifying repositories identified
- 289 repositories with a `package.json`
- 140 repositories successfully built

Relevant files:
- `build-results.csv`
- `executability-screening.csv`
- `RUNNABLE.md`

Note: A successful build does not necessarily mean that every function can be executed independently.

### Task 3: Property-Based Testing

Use fast-check to test functions in TypeScript files from the executable repositories.

**Status:** In progress.

Current work includes:
- Creating an inventory of TypeScript files and functions
- Developing automated test generation and execution scripts
- Running initial behavioral property tests
- Investigating testing limitations involving dependencies, class methods, and application-specific environments
- Recording testing results and coverage

The 140 successfully built repositories contain 5,858 TypeScript/TSX files. The initial inventory identified functions in 4,925 files.

The current broad testing approach checks whether supported functions throw exceptions when given generated inputs. These robustness checks do not necessarily verify functional correctness, and complete per-file coverage has not yet been achieved.

Main scripts:
- `scripts/broad_task3.py`
- `scripts/broad_worker.cjs`
- `scripts/run_fastcheck_pipeline.py`
- `scripts/fastcheck_worker.cjs`

Relevant results:
- `fast-check-results.csv`
- `fast-check-broad-results.csv`
- `fast-check-broad-classification.csv`
- `typescript-function-inventory.csv`

### Task 4: Race-Condition Testing

Develop and apply a testing methodology to identify potential race conditions in the selected repositories.

**Status:** Not yet implemented.

Starting resource: [fast-check race-condition tutorial](https://fast-check.dev/docs/tutorials/detect-race-conditions/wrapping-up/)

Task 4 code, results, and documentation will be maintained separately under `task4/`.

## Repository Organization

| Location | Purpose |
|---|---|
| `task1/` | Task 1 documentation and repository-selection information |
| `task2/` | Task 2 documentation and build analysis |
| `task3/` | Task 3 documentation and testing notes |
| `task4/` | Task 4 race-condition testing |
| `scripts/` | Existing analysis and testing scripts |
| `tests/` | Existing test cases |
| `sqa_inventory_package/` | Function inventory utilities |
| `RUNNABLE.md` | Task 2 build results and notes |

Some scripts and generated CSV files remain in the repository root while the project is being organized.

## Setup

Requirements:
- Python 3
- Node.js and npm
- TypeScript
- fast-check
- Access to the original repository dataset

Install the project's Node.js dependencies:

```bash
npm install
```

The original repository dataset and extracted repository copies are not included in GitHub because of their size.

Some scripts require access to these local files and may need path configuration before running on another computer.

## Collaboration

Task 3 and Task 4 are being developed separately so that both tasks can progress in parallel.

Please keep Task 4 scripts, test cases, CSV results, and documentation in the `task4/` directory. Avoid modifying the existing Task 3 scripts without coordinating first.

## Notes

This project is still in development. Testing results and coverage may change as the methodology is refined.

A successful robustness test does not necessarily demonstrate that a function produces the correct output. Similarly, an execution error caused by a missing dependency does not automatically indicate a defect in the repository being tested.
