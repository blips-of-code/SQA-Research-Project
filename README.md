# SQA Research Project

## Project Overview

This repository contains our work for the Software Quality Assurance (SQA) research project. The project focuses on analyzing TypeScript-based Visual Studio Code extensions, identifying executable repositories, performing property-based testing, and detecting potential race conditions.

The project consists of four tasks:

1. **Task 1:** Familiarization with TypeScript
2. **Task 2:** Identification and executability analysis of TypeScript-based VS Code extensions
3. **Task 3:** Generic defect detection using fast-check
4. **Task 4:** Race-condition detection using fast-check

## Task 1: Familiarization with TypeScript

Become familiar with TypeScript and its basic concepts.

No separate deliverables are required for this task.

## Task 2: VS Code Extension Analysis

**Status: Initial screening and build analysis completed.**

The provided dataset contains VS Code extension repositories. We identified repositories containing at least 5% TypeScript-related files and evaluated whether they could be built.

### Results

- **299** repositories met the TypeScript screening criteria.
- **289** qualifying repositories contained a `package.json`.
- **140** repositories successfully built during the build analysis.

The list of successfully built repositories is available in [RUNNABLE.md](RUNNABLE.md).

Additional screening and build results are available in the repository root, including `qualifying-repos.csv`, `executability-screening.csv`, and `build-results.csv`.

A successful build does not necessarily guarantee that every function in a repository can be executed independently.

For more information, see [Task 2 Documentation](task2/README.md).

## Task 3: Generic Defect Detection

**Status: In progress.**

Task 3 uses [fast-check](https://fast-check.dev/) to perform property-based testing on the executable repositories identified in Task 2.

The goal is to test at least one function in every TypeScript file across the executable repositories.

### Current Progress

- Identified **5,858** TypeScript/TSX files across the 140 successfully built repositories.
- Created a function inventory that discovered functions in **4,925** files.
- Developed scripts for automated function discovery and testing.
- Executed initial behavioral property tests.
- Developed broader robustness tests using generated inputs.
- Recorded testing results, coverage, and execution limitations.

Complete per-file testing coverage has not yet been achieved. Some functions require external dependencies, class instances, or application-specific environments.

### Required CSV Format

`FilePath,TestCaseName,FunctionName,Status,ExpectedValue,ProvidedValue,ErrorMessage,FailureCategory,InputParamater`

The spelling `InputParamater` follows the assignment instructions.

### Relevant Files

- `scripts/` — Automated testing scripts
- `tests/` — Existing test cases
- `fast-check-results.csv` — Initial testing results
- `fast-check-broad-results.csv` — Automated robustness-testing results
- `fast-check-broad-classification.csv` — File classifications and testing limitations
- `typescript-function-inventory.csv` — Discovered TypeScript functions

For more information, see [Task 3 Documentation](task3/README.md).

## Task 4: Race-Condition Detection

**Status: Completed.**

Task 4 involves developing a methodology for detecting race-condition vulnerabilities using the [fast-check race-condition tutorial](https://fast-check.dev/docs/tutorials/detect-race-conditions/wrapping-up/).

The methodology will be applied to the executable repositories identified in Task 2.

### Required CSV Format

`FilePath,Found,Location,ObservedConsequence`

- **FilePath:** Full path of the file being tested
- **Found:** `Y` if a race condition was found, otherwise `N`
- **Location:** Line number of the vulnerability, or `NA`
- **ObservedConsequence:** Observed effect of the vulnerability, or `NA`

Task 4 code, fast-check race-condition tests, execution results, and documentation are maintained in `task4/`.

For more information, see [Task 4 Documentation](task4/README.md).

## Repository Structure

| Location | Description |
|---|---|
| `README.md` | Project overview and progress |
| `RUNNABLE.md` | List of successfully built repositories |
| `task2/` | Task 2 documentation |
| `task3/` | Task 3 documentation |
| `task4/` | Task 4 code, results, and documentation |
| `scripts/` | Existing repository analysis and testing scripts |
| `tests/` | Existing test cases |
| `sqa_inventory_package/` | TypeScript function inventory utilities |
| Root-level CSV files | Repository screening, build analysis, function inventory, and testing results |

## Tools and Requirements

The project uses:

- Python 3
- Node.js and npm
- TypeScript
- fast-check
- Docker (used for repository build screening)

Install the project's Node.js dependencies:

```bash
npm install
```

The original repository dataset and extracted repository copies are not included in GitHub because of their size. Some scripts require access to these files and may need local path configuration.

Task-specific setup instructions and Python dependency files will be finalized as the testing workflows are completed.

## Collaboration

Task 3 and Task 4 are being developed separately so both can progress in parallel.

Task 4 development should take place in the `task4/` directory. Please coordinate before modifying shared scripts or configuration files.

## Important Notes

This project is still in development.

- Passing a robustness test does not necessarily mean that a function produces the correct output.
- An execution error caused by missing dependencies does not automatically indicate a software defect.
- A race-condition vulnerability should only be reported when supported by observed testing evidence.
