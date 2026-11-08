# Task 2: Familiarization with VS Code Extensions Developed in TypeScript

**Status: Initial screening and build analysis completed.**

## Objective

Analyze the provided dataset of VS Code extension repositories to:

1. Identify repositories where at least 5% of files are TypeScript-related.
2. Determine which qualifying repositories are executable.
3. Document the executable repositories in `RUNNABLE.md`.

## Results

| Category | Count |
|---|---:|
| TypeScript-qualifying repositories | 299 |
| Qualifying repositories with `package.json` | 289 |
| Successfully built repositories | 140 |

The list of successfully built repositories is available in [RUNNABLE.md](../RUNNABLE.md).

## Relevant Files

All the following files are currently located in the repository root:

| File | Description |
|---|---|
| `RUNNABLE.md` | List of successfully built repositories |
| `qualifying-repos.csv` | Initial TypeScript repository screening |
| `qualifying-repos-refined.csv` | Refined qualifying repository list |
| `executability-screening.csv` | Repository executability screening |
| `build-results.csv` | Repository build results |
| `build-results-first-pass.csv` | Initial build results |
| `package-repos.txt` | Repositories containing package metadata |
| `qualifying-with-package.txt` | Qualifying repositories with `package.json` |

## Methodology

Repositories were screened according to the assignment's minimum 5% TypeScript-related file requirement.

Qualifying repositories were then evaluated for build success using automated scripts and a Node.js environment.

A repository was included in the successfully built list if its build completed successfully during screening.

**Note:** Build success is used as the executability criterion for this screening. It does not guarantee that every function or extension feature can be executed independently.

## Code

Relevant scripts are currently located in the repository root and `scripts/` directory.

The original repository dataset is not included in GitHub because of its size.

Return to the [main README](../README.md).
