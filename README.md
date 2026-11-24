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

**Status: Completed, with documented testing coverage limitations.**

Task 3 uses [fast-check](https://fast-check.dev/) to perform automated property-based testing on the executable repositories identified in Task 2.

The testing methodology combines behavioral property testing, broad automated function execution, dependency handling, and expected-output verification using existing repository assertions.

### Results

| Category | Count |
|---|---:|
| Executable repositories | 140 |
| TypeScript/TSX files identified | 5,858 |
| Eligible files containing functions | 4,925 |
| Files without discovered functions | 933 |
| Functions classified as executed | 5,191 |
| Exploratory execution records | 38,766 |
| Successful executions with unverified correctness | 13,245 |
| Exceptions requiring review | 9,769 |
| Blocked execution records | 15,752 |
| Dependency attempt records | 35,202 |
| Verified passing test records | 66 |
| Verified failing test records | 0 |
| Blocked repository assertion cases | 3 |

All 4,925 eligible files were accounted for during automated processing and classification. However, complete function execution and correctness-testing coverage could not be achieved due to dependency, parameter-generation, and application-context limitations.

Successful execution is distinguished from verified correctness. Exceptions are documented as potential defect indicators rather than automatically classified as confirmed defects.

### Required CSV Format

`FilePath,TestCaseName,FunctionName,Status,ExpectedValue,ProvidedValue,ErrorMessage,FailureCategory,InputParamater`

The spelling `InputParamater` follows the assignment instructions.

The final assignment-format CSV contains 66 passing records with established expected outcomes. Exploratory execution results and blocked cases are retained separately to preserve all testing evidence.

### Relevant Files

| File | Description |
|---|---|
| `scripts/` | Automated testing and verification programs |
| `fast-check-results.csv` | Final assignment-format testing results |
| `fast-check-initial-property-results.csv` | Original behavioral property results |
| `fast-check-review-results.csv` | Broad automated execution results |
| `fast-check-review-classification.csv` | Function and file classifications |
| `fast-check-review-blocked.csv` | Execution limitations |
| `fast-check-review-dependencies.csv` | Dependency attempt records |
| `fast-check-oracle-cases.csv` | Extracted repository assertions |
| `fast-check-verified-results.csv` | Detailed expected-output verification results |
| `typescript-function-inventory.csv` | Discovered TypeScript functions |
| `task3/requirements.txt` | Python dependency requirements |

For detailed methodology, setup instructions, execution commands, results, and limitations, see [Task 3 Documentation](task3/README.md).

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

Task-specific setup instructions and dependency requirements are available in the [Task 3 Documentation](task3/README.md) and [Task 4 Documentation](task4/README.md).

## Collaboration

Task 3 and Task 4 were developed separately to allow both testing workflows to progress in parallel.

Task 3 testing programs are maintained in `scripts/`, with documentation in `task3/` and results in the repository root.

Task 4 testing programs, results, dependencies, and documentation are maintained in `task4/`.

## Important Notes

The project documents automated testing results, observed findings, and methodological limitations. Results should be interpreted within the scope of the implemented testing workflows.

- Passing a robustness test does not necessarily mean that a function produces the correct output.
- An execution error caused by missing dependencies does not automatically indicate a software defect.
- A race-condition vulnerability should only be reported when supported by observed testing evidence.
