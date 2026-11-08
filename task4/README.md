# Task 4: Apply a Testing Tool to Find Race Conditions

**Status: Not yet implemented.**

## Objective

Develop and apply a testing methodology to identify race-condition vulnerabilities in the TypeScript-based VS Code extension repositories.

The methodology should be based on the [fast-check race-condition tutorial](https://fast-check.dev/docs/tutorials/detect-race-conditions/wrapping-up/).

## Repository Dataset

Task 2 identified 140 repositories that successfully built.

The list is available in [RUNNABLE.md](../RUNNABLE.md).

Additional repository screening and build information is available in:

- `../build-results.csv`
- `../qualifying-repos-refined.csv`
- `../executability-screening.csv`

The original dataset is not included in GitHub because of its size. It must be obtained separately to run tests against the source repositories.

## Assignment Requirements

1. Read the fast-check race-condition tutorial.
2. Develop a method for detecting potential race conditions.
3. Apply the method to the executable repositories identified in Task 2.
4. Record race-condition findings in the required CSV format.
5. Upload the testing programs and a Markdown file explaining how to run them.
6. Include a `requirements.txt` file describing the packages needed to run the programs.

## Suggested Starting Approach

The following is a proposed workflow, not a completed implementation.

### 1. Identify Candidate Functions

Search for functions involving asynchronous operations, shared mutable state, or concurrent access to resources.

Not every asynchronous function contains a race condition.

### 2. Develop Race-Condition Tests

Use the fast-check tutorial as a reference for controlling the execution order of asynchronous operations.

Design tests that check whether different execution orders can produce unexpected or inconsistent behavior.

### 3. Execute Tests

Run the testing methodology against suitable functions in the executable repositories.

Record whether a race condition was actually observed.

### 4. Record Results

Generate a CSV with the following exact headers:

`FilePath,Found,Location,ObservedConsequence`

| Column | Description |
|---|---|
| `FilePath` | Full path of the file containing the function of interest |
| `Found` | `Y` if a race condition vulnerability was found, otherwise `N` |
| `Location` | Line number of the vulnerability, or `NA` if none was found |
| `ObservedConsequence` | Observed symptom or consequence, such as a hang or crash, or `NA` if none was found |

An execution failure caused by missing dependencies should not automatically be reported as a race condition.

## Task 4 File Organization

Please keep Task 4 work inside this directory.

Suggested structure:

```text
task4/
├── README.md
├── requirements.txt
├── scripts/
├── tests/
└── results/
```

The `scripts/`, `tests/`, and `results/` directories can be created as the implementation develops.

## Deliverables

- Automated race-condition testing program(s)
- `requirements.txt`
- Instructions for running the programs
- CSV containing race-condition findings
- Code uploaded to the shared GitHub repository

## Collaboration Notes

Task 4 can be developed independently of Task 3.

Please avoid modifying existing Task 3 scripts or results without coordinating first.

Return to the [main README](../README.md).
