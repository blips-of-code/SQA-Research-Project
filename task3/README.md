# Task 3: Apply a Testing Tool to Find Generic Defects

**Status: In progress.**

## Objective

Use [fast-check](https://fast-check.dev/) to perform property-based testing on the executable TypeScript repositories identified in Task 2.

The assignment requires targeting at least one function in every TypeScript file across the executable repositories.

## Dataset

The 140 successfully built repositories contain:

| Category | Count |
|---|---:|
| TypeScript/TSX files | 5,858 |
| Files with discovered functions | 4,925 |
| Files without discovered functions | 933 |

These counts come from the initial function inventory.

## Testing Approach

The testing workflow currently includes:

1. **Function discovery:** Identify functions and their parameters using TypeScript analysis.
2. **Test generation:** Use fast-check to generate inputs for supported functions.
3. **Test execution:** Execute tests and record the observed results.
4. **Result classification:** Record passed tests, failed tests, and cases that could not be executed.
5. **Coverage analysis:** Track which files have been processed and which still require testing.

Two testing approaches have been explored:

### Behavioral Property Tests

These tests check whether a function satisfies an expected behavior or property.

Examples include verifying a transformation, checking an invariant, or comparing the returned value against an expected result.

### Robustness Tests

These tests use fast-check to generate inputs and check whether supported functions execute without throwing an exception.

A passing robustness test does not necessarily mean the function's output is correct.

The broad robustness-testing workflow is experimental and does not yet provide complete coverage of the required files.

## Relevant Scripts

The following scripts are currently located in `../scripts/`:

| Script | Purpose |
|---|---|
| `fastcheck_worker.cjs` | Initial fast-check test execution |
| `run_fastcheck_pipeline.py` | Runs the initial testing pipeline |
| `broad_worker.cjs` | Automated robustness-testing worker |
| `broad_task3.py` | Processes files through the broad testing workflow |
| `audit_task3.py` | Audits testing results and coverage |

Other scripts in `../scripts/` contain experimental testing approaches and supporting utilities.

## Results

The following files are currently located in the repository root:

| File | Description |
|---|---|
| `fast-check-results.csv` | Initial fast-check results |
| `fast-check-broad-results.csv` | Broad robustness-testing results |
| `fast-check-broad-classification.csv` | Classification of processed files |
| `fast-check-broad-blocked.csv` | Blocked execution cases |
| `fast-check-coverage.csv` | Coverage information |
| `typescript-files.csv` | Inventory of TypeScript files |
| `typescript-function-inventory.csv` | Inventory of discovered functions |
| `typescript-no-functions.csv` | Files without discovered functions |

Some files are diagnostic or experimental outputs and are not final assignment deliverables.

## Required CSV Format

The final testing CSV must contain these columns in order:

`FilePath,TestCaseName,FunctionName,Status,ExpectedValue,ProvidedValue,ErrorMessage,FailureCategory,InputParamater`

- `Status` must be `Passed` or `Failed`.
- `ErrorMessage` contains the first line of the error message for failed tests.
- `FailureCategory` describes the reason for failure.
- `InputParamater` identifies the tested parameter.
- Functions with multiple parameters require repeated entries.

The spelling `InputParamater` is preserved from the assignment instructions.

## Current Limitations

- Some functions depend on external modules or application-specific environments.
- Class methods may require additional setup or object instances.
- Not every function can be tested independently using the current automated approach.
- Complete per-file testing coverage has not yet been achieved.
- Robustness checks do not establish functional correctness.

## Setup

Install the Node.js dependencies from the repository root:

```bash
npm install
```

The existing testing scripts also require Python and access to the original repository dataset.

Script-specific paths and execution instructions are still being finalized. Do not assume that the current scripts will run on a new computer without additional configuration.

## Remaining Work

- Refine the testing methodology.
- Improve coverage of executable functions.
- Review failures and execution limitations.
- Produce and validate the final required CSV.
- Add a `requirements.txt` file for Python dependencies.
- Finalize reproducible instructions for running the testing programs.

Return to the [main README](../README.md).
