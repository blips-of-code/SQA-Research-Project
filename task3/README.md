# Task 3: Apply a Testing Tool to Find Generic Defects

**Status: Testing and results analysis completed, with documented coverage limitations.**

## Objective

Use [fast-check](https://fast-check.dev/) to perform automated property-based testing on the executable TypeScript repositories identified in Task 2. The testing process aims to identify incorrect outputs, runtime exceptions, and other potential defects while documenting functions that cannot be executed due to environmental or dependency limitations.

## Dataset

The 140 successfully built repositories identified in Task 2 contain the following:

| Category | Count |
|---|---:|
| Executable repositories | 140 |
| TypeScript/TSX files | 5,858 |
| Files with discovered functions | 4,925 |
| Files without discovered functions | 933 |

Files without discovered functions were excluded from the required function-testing scope.

All 4,925 eligible files were accounted for during the automated testing and classification process. However, not every function could be successfully executed.

## Testing Methodology

The testing methodology consists of three complementary approaches.

### 1. Behavioral Property Testing

The initial testing approach used fast-check to generate inputs and evaluate functions against established behavioral properties.

These tests evaluated whether functions satisfied expected transformations, invariants, or other known properties.

This phase produced 13 passing test records.

### 2. Broad Automated Testing

To increase testing coverage across the executable repositories, an automated testing pipeline was developed using Python, TypeScript analysis, Node.js, and fast-check.

The pipeline performs the following activities:

1. Reads the TypeScript file and function inventories generated during Task 2.
2. Retrieves source files from the original repository dataset.
3. Identifies functions and their parameter types using TypeScript analysis.
4. Generates inputs for supported parameter types using fast-check.
5. Transpiles TypeScript code and attempts function execution.
6. Records generated inputs, returned values, exceptions, and execution limitations.
7. Attempts to resolve and use required dependencies.
8. Records function-level and file-level classifications.

The broad testing configuration uses ten generated runs per supported function.

Functions requiring unavailable application environments, object instances, unsupported parameter types, or unresolved dependencies are documented rather than silently excluded.

Successful execution without an established expected output is classified as `Observed`, not `Passed`.

### 3. Expected-Output Verification

To supplement exploratory execution with functional correctness checks, an additional verification pipeline was developed.

The pipeline extracts supported literal assertions from existing repository test files, identifies the corresponding source functions, executes them using the extracted arguments, and compares the returned values with the expected outputs.

A total of 56 repository assertion cases were extracted:

- 53 passed.
- 3 were blocked by source-resolution or execution-context limitations.
- No incorrect outputs were confirmed among the successfully verified cases.

The original repository assertions serve as test oracles. This verification phase supplements the generated-input testing performed using fast-check.

## Dependency Handling

The testing pipeline records dependency import and usage attempts. When an applicable dependency cannot be resolved or used, the pipeline attempts recovery up to three times and records the outcomes.

The dependency log contains 35,202 attempt records, including 1,094 records classified as `ImportedAndUsed`.

Some recorded dependency failures involve Node.js built-in modules, relative imports, or application-specific modules such as `vscode`. These should not be interpreted exclusively as missing third-party packages.

Functions that require unavailable runtime environments or unresolved dependencies are documented as blocked or unsupported.

## Results

### Broad Automated Testing

| Execution Status | Records |
|---|---:|
| Observed | 13,245 |
| Exception | 9,769 |
| Blocked | 15,752 |
| **Total** | **38,766** |

The execution statuses are defined as follows:

- **Observed:** The function returned a value, but its correctness was not independently established.
- **Exception:** An exception occurred during execution and requires contextual investigation.
- **Blocked:** Execution could not be completed due to dependency, environment, or other contextual limitations.

Exceptions are potential defect indicators, not automatically confirmed software defects.

### Function Classification

| Classification | Records |
|---|---:|
| Executed | 5,191 |
| Unsupported | 26,302 |
| Processed | 5,040 |
| NoRecognizedFunction | 436 |
| Blocked | 14 |
| ScanBlocked | 2 |
| ProcessedWithError | 2 |
| **Total** | **36,987** |

The classification file includes both function-level classifications and file-level processing records. Consequently, its total record count does not represent the number of unique functions.

Historical processing records are retained for traceability.

### Final Verified Results

| Testing Approach | Passed | Failed | Blocked |
|---|---:|---:|---:|
| Initial behavioral property testing | 13 | 0 | 0 |
| Repository assertion verification | 53 | 0 | 3 |
| **Total** | **66** | **0** | **3** |

The final assignment-format CSV contains the 66 records with established expected outcomes and binary pass/fail classifications.

The three blocked verification cases are retained in the detailed verification CSV.

No confirmed incorrect outputs were identified among these verified cases. This does not establish that the remaining functions are defect-free.

## Output Files

The following files are located in the repository root.

| File | Description |
|---|---|
| `fast-check-results.csv` | Final assignment-format results containing 66 verified passing records |
| `fast-check-review-results.csv` | 38,766 exploratory execution records |
| `fast-check-review-classification.csv` | 36,987 function and file classification records |
| `fast-check-review-blocked.csv` | 37,687 records documenting execution limitations |
| `fast-check-review-dependencies.csv` | 35,202 dependency attempt records |
| `fast-check-oracle-cases.csv` | 56 extracted repository assertion cases |
| `fast-check-verified-results.csv` | Detailed verification results, including blocked cases |
| `typescript-files.csv` | TypeScript file inventory |
| `typescript-function-inventory.csv` | Function inventory |
| `typescript-no-functions.csv` | Files without discovered functions |

Earlier experimental outputs are retained for historical reference. The files listed above represent the final Task 3 results and supporting evidence.

## Required CSV Format

The final `fast-check-results.csv` contains the following columns in the order specified by the assignment:

`FilePath,TestCaseName,FunctionName,Status,ExpectedValue,ProvidedValue,ErrorMessage,FailureCategory,InputParamater`

- `Status` contains either `Passed` or `Failed`.
- `ExpectedValue` records the established expected outcome.
- `ProvidedValue` records the observed outcome.
- `ErrorMessage` records applicable execution errors.
- `FailureCategory` identifies the applicable failure classification.
- `InputParamater` records the tested input.

The spelling `InputParamater` is preserved from the assignment instructions.

Exploratory outcomes without established expected values are maintained separately to avoid incorrectly reporting successful execution as verified correctness.

## Relevant Scripts

The primary scripts are located in `../scripts/`.

| Script | Purpose |
|---|---|
| `broad_task3.py` | Main automated testing pipeline |
| `broad_worker.cjs` | TypeScript analysis, input generation, and function execution |
| `extract_test_oracles.cjs` | Extraction of existing repository assertions |
| `verify_task3.py` | Expected-output verification |
| `normalize_task3.py` | Correction of legacy exploratory status labels |
| `dependency_audit.py` | Supplementary dependency-resolution analysis |
| `fastcheck_worker.cjs` | Initial behavioral property testing |
| `run_fastcheck_pipeline.py` | Initial property-testing pipeline |
| `audit_task3.py` | Earlier results and coverage auditing |

Other scripts in the repository represent earlier experimental approaches and supporting utilities.

## Environment and Dependencies

The local Task 3 testing environment uses:

- Python 3.15.0
- Node.js v24.21.0
- npm 11.19.0
- fast-check 4.10.2, as specified by the package manifest
- TypeScript 5.9.3, as specified by the package manifest

Task 2 repository build screening was performed using a separate Node.js 20 Docker environment.

The primary Python scripts use only standard library modules. Node.js dependencies are managed through `package.json` and `package-lock.json`.

## Setup and Execution

Run the following commands from the repository root.

### 1. Install Dependencies

```bash
npm ci
python -m pip install -r task3/requirements.txt
```

### 2. Prepare the Dataset

Obtain the original `yzz0229-VSCODE-DATA.zip` dataset.

The TypeScript file and function inventories generated during Task 2 must also be available in the repository root.

Replace `/path/to/yzz0229-VSCODE-DATA.zip` in the following commands with the actual dataset location.

### 3. Preview Testing Scope

```bash
python scripts/broad_task3.py \
  --zip "/path/to/yzz0229-VSCODE-DATA.zip" \
  --function-inventory typescript-function-inventory.csv \
  --dry-run
```

### 4. Execute Broad Testing

```bash
python scripts/broad_task3.py \
  --zip "/path/to/yzz0229-VSCODE-DATA.zip" \
  --function-inventory typescript-function-inventory.csv \
  --runs 10
```

The pipeline supports incremental execution and skips previously completed eligible files by default.

The optional `--repos-dir` argument can be used to specify a directory containing extracted repositories with installed dependencies.

The `--limit` argument can be used to restrict execution to a smaller number of new files.

The `--rerun-completed` option should only be used when intentional reprocessing is required.

### 5. Execute Expected-Output Verification

The supplied `fast-check-oracle-cases.csv` contains the extracted repository assertion cases.

```bash
python scripts/verify_task3.py \
  --zip "/path/to/yzz0229-VSCODE-DATA.zip"
```

The optional `--retry-context` argument allows previously blocked or exception-producing verification cases to be retried.

### 6. Normalize Legacy Results, If Necessary

```bash
python scripts/normalize_task3.py
```

This script corrects legacy status labels without rerunning functions. It preserves a backup when modifications are required.

The submitted results have already been normalized.

### 7. Generate the Final Assignment CSV

```bash
python scripts/finalize_task3.py \
  --initial fast-check-initial-property-results.csv
```

This script combines the original behavioral property results with the repository assertion verification results and produces the final nine-column `fast-check-results.csv` without rerunning tests.

## Limitations

- Although all eligible files were accounted for, complete execution coverage of every function was not achieved.
- Class methods may require object instances and additional initialization.
- Some functions require VS Code extension-host APIs or other application-specific environments.
- Complex, generic, or unannotated parameter types cannot always be automatically generated.
- Dependency-resolution records may include built-in modules, local imports, and application-specific dependencies.
- Generated inputs may not satisfy undocumented function preconditions.
- Exceptions may result from missing execution context rather than defects in the original implementation.
- Successful execution does not independently establish functional correctness.
- Expected-output verification is limited to supported behavioral properties and extractable repository assertions.
- Some functions with multiple parameters are recorded using combined argument representations rather than separate parameter-level entries.
- The final binary-status CSV represents only tests with established expected outcomes. It does not provide complete correctness-testing coverage across all eligible functions.
- Reproduction may require repository-specific dependencies and the original execution environment.

## Conclusion

Task 3 developed an automated testing pipeline combining fast-check input generation, TypeScript function analysis, dependency handling, execution classification, and expected-output verification.

The pipeline accounted for 4,925 eligible TypeScript files across 140 executable repositories and produced 38,766 exploratory execution records.

The final assignment-format CSV contains 66 passing tests with established expected outcomes. Additional execution outcomes, exceptions, blocked cases, and dependency limitations are retained in supplementary CSV files to provide transparency and support further investigation.

The results demonstrate the applicability of automated property-based testing to large TypeScript datasets while highlighting the challenges of executing functions independently of their original application environments.

Return to the [main README](../README.md).