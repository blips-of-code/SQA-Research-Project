Task 4 — Race Condition Detection with fast-check
Objective
This task develops and applies a race-condition testing methodology to executable TypeScript repositories identified during Task 2.
The workflow has two stages:
1. Static candidate analysis to identify asynchronous functions that may be susceptible to race conditions.
2. Dynamic validation using fast-check while executing the actual functions from selected repositories.
External dependencies such as VS Code APIs, shell commands, filesystem operations, and UI interactions are mocked when necessary. The repository functions under test are imported and executed from their original source files rather than reimplemented.
Candidate Analysis
Run:
python3 scripts/find_race_candidates.py
Candidate-analysis results are stored in:
results/race_candidates.csv
results/high_priority_race_candidates.csv
The analysis identifies asynchronous and shared-state functions that are candidates for dynamic race-condition testing.
Setup
Python
The Task 4 Python scripts use Python standard-library modules.
python3 -m pip install -r requirements.txt
Node.js / TypeScript
Install the Task 4 dependencies:
npm install
The primary testing dependencies are:
* fast-check
* tsx
* mock-require
The dependencies of each selected repository must also be installed before its test is executed.
Dynamic Race-Condition Tests
Static screening identified 201 candidates across 38 repositories. The high-priority results contain 65 candidates across 18 repositories. Five selected functions were dynamically tested. The remaining candidates were not dynamically validated.
1. setSubscriptionAsync
Repository:
vscode-kubernetes-tools-vscode-kubernetes-tools
Run:
npx tsx tests/test_setSubscription_actual_race.ts
The test executes the actual setSubscriptionAsync implementation while mocking the external shell interface.
Concurrent invocations were observed issuing operations that modify shared Azure CLI subscription state.
Result: Potential shared-state race observed through overlapping shell operations. An incorrect final Azure subscription was not independently verified.
2. updateSetting
Repository:
jest-community-vscode-jest
Run:
npx tsx tests/test_updateSetting_actual_race.ts
The actual updateSetting function reads the virtualFolders configuration, modifies an entry, and writes the complete array back.
Concurrent calls demonstrated a lost-update condition in which one update overwrote another.
Result: Race condition observed.
3. openOffsetInput
Repository:
microsoft-vscode-hexeditor
Run:
npx tsx tests/test_openOffsetInput_actual_race.ts
Concurrent calls produced overlapping showInputBox requests.
No incorrect return value, corrupted state, or other harmful consequence was observed during testing.
Result: No confirmed harmful race condition observed.
4. showInputBoxWithSettings
Repository:
Dart-Code-Dart-Code
Run:
npx tsx tests/test_showInputBox_actual_race.ts
The actual function registers multiple event handlers that can resolve the same Promise.
Testing showed that event ordering changes the observed result:
accept first -> { value: "ABC123" }
settings button first -> "SETTINGS"
Result: Expected first-event-wins behavior; no harmful race demonstrated (Found=N).
5. addAssetsIfNecessary
Repository:
dotnet-vscode-csharp
Run:
npx tsx tests/test_addAssets_actual_race.ts
Two concurrent invocations were able to pass the assetPromptDisabled check before either invocation recorded the "Don't Ask Again" state.
This caused duplicate build-assets prompts.
Result: Race condition observed.
Run All Dynamic Tests
npx tsx tests/test_setSubscription_actual_race.ts
npx tsx tests/test_updateSetting_actual_race.ts
npx tsx tests/test_openOffsetInput_actual_race.ts
npx tsx tests/test_showInputBox_actual_race.ts
npx tsx tests/test_addAssets_actual_race.ts
Each dynamic test executes 100 fast-check runs.
Recorded Execution Results
The recorded outputs are:
results/setSubscription_fastcheck_actual.txt
results/updateSetting_fastcheck_actual.txt
results/openOffsetInput_fastcheck_actual.txt
results/showInputBox_fastcheck_actual.txt
results/addAssets_fastcheck_actual.txt
Required Results CSV
The final results file is:
results/race_condition_results.csv
It uses the required columns:
FilePath,Found,Location,ObservedConsequence
Found=Y identifies a race-related finding supported by dynamic evidence. The Azure finding represents a potential shared-state race rather than a verified incorrect final subscription.
Found=N means the candidate was dynamically tested but no harmful race consequence was confirmed.
Testing Principle
Static analysis is used only to identify candidates.
Dynamic evidence is required for positive findings. Observed behavior is distinguished from inferred downstream consequences.
Mocks are limited to external environment dependencies and asynchronous timing control. The actual repository functions are imported and executed during the tests.
## Authoritative Results

The final authoritative Task 4 results are stored in:

`results/race_condition_results.csv`

The newer dynamic tests under `tests/*_actual_race.ts` supersede the earlier exploratory or simulation-based tests.

The final tests execute the actual repository functions. External systems such as VS Code APIs, shell commands, filesystem behavior, and UI components are mocked only where necessary to execute the repository code in an isolated testing environment.

## Candidate Repository Setup

The candidate repositories are not committed to this GitHub repository because of their size.

From the project root, create the candidate repository directory:

mkdir -p task4/candidate-repositories
cd task4/candidate-repositories

Clone the repositories used for dynamic validation:

git clone https://github.com/vscode-kubernetes-tools/vscode-kubernetes-tools.git vscode-kubernetes-tools-vscode-kubernetes-tools
git clone https://github.com/jest-community/vscode-jest.git jest-community-vscode-jest
git clone https://github.com/microsoft/vscode-hexeditor.git microsoft-vscode-hexeditor
git clone https://github.com/Dart-Code/Dart-Code.git Dart-Code-Dart-Code
git clone https://github.com/dotnet/vscode-csharp.git dotnet-vscode-csharp

Install dependencies inside each candidate repository using:

npm install

Then return to the Task 4 directory:

cd ..

Install Task 4 dependencies:

npm install

Run all Task 4 dynamic tests with:

npm test


## Reproducibility and Coverage Limitations

The static screening script reads the existing
`typescript-function-inventory.csv` generated from Task 2
repository analysis. It automatically filters and ranks
asynchronous exported functions using mutation-related
function names and return types.

The high-priority CSV records the prioritized candidate
subset. The final results CSV summarizes the five
selected dynamic tests; it is not an exhaustive
classification of every static candidate.

Run the static screening and dynamic tests from the
`task4` directory.

For faithful reproduction, use the corresponding source
repositories from the original course dataset whenever
available. Cloning the latest upstream versions may
introduce source, dependency, and line-number differences.

Dynamic results are limited to the tested functions,
generated inputs, schedules, and mocked environments.
Negative findings do not establish that a repository
is free of race conditions.
