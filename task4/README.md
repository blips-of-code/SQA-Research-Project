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
Five functions from the Task 2 executable repositories were dynamically tested.
1. setSubscriptionAsync
Repository:
vscode-kubernetes-tools-vscode-kubernetes-tools
Run:
npx tsx tests/test_setSubscription_actual_race.ts
The test executes the actual setSubscriptionAsync implementation while mocking the external shell interface.
Concurrent invocations were observed issuing operations that modify shared Azure CLI subscription state.
Result: Race-related concurrency issue observed.
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
Result: Timing-dependent race/event-order behavior observed.
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
Found=Y means dynamic testing observed a race-related consequence.
Found=N means the candidate was dynamically tested but no harmful race consequence was confirmed.
Testing Principle
Static analysis is used only to identify candidates.
A function is marked Found=Y only when dynamic execution provides evidence of a race-related consequence.
Mocks are limited to external environment dependencies and asynchronous timing control. The actual repository functions are imported and executed during the tests.

