Task 4 - Dynamic Validation of Race-Condition Candidates
Objective
Static analysis identified asynchronous TypeScript functions that may contain race-condition risks. The highest-priority candidates were manually inspected and then evaluated using controlled dynamic tests.
The final dynamic tests execute the actual repository functions using fast-check. External dependencies such as VS Code APIs, shell commands, filesystem behavior, and UI components are mocked only where necessary to execute the repository code in an isolated environment.
The results in race_condition_results.csv are the authoritative final Task 4 results.
Earlier exploratory or simulation-based conclusions are superseded by the final actual-function fast-check tests described below.
Final Validation Results
Repository	Function	Found	Final Result
jest-community-vscode-jest	updateSetting	Y	Race reproduced
vscode-kubernetes-tools-vscode-kubernetes-tools	setSubscriptionAsync	Y	Race reproduced
dotnet-vscode-csharp	addAssetsIfNecessary	Y	Race reproduced
Dart-Code-Dart-Code	showInputBoxWithSettings	N	No harmful race demonstrated
microsoft-vscode-hexeditor	openOffsetInput	N	No harmful race demonstrated
1. updateSetting
Repository:
jest-community-vscode-jest
Source:
src/Settings/helper.ts
Location:
44
Function:
updateSetting
Analysis
The function follows a read-modify-write pattern on the virtualFolders configuration.
Each invocation reads the current virtualFolders array, modifies its own copy, and later writes the complete array back to the configuration.
Two concurrent invocations can therefore read the same original state and then overwrite each other's changes.
Dynamic Test
The actual repository function was imported and executed.
The VS Code configuration API was mocked only to provide the external environment required by the function.
fast-check was used to execute concurrent updates with different generated values.
Observed Result
Expected:
* Folder A = new value A
* Folder B = new value B
Observed in a race-producing execution:
* Folder A = new value A
* Folder B = old value B
One concurrent update was overwritten by the other invocation.
Classification
Race reproduced.
Observed Consequence
Concurrent updateSetting calls can overwrite each other's virtualFolders changes because each invocation reads a snapshot and later writes the entire array.
Final Result
Found=Y

2. setSubscriptionAsync
Repository:
vscode-kubernetes-tools-vscode-kubernetes-tools
Source:
src/components/clusterprovider/azure/azure.ts
Location:
102
Function:
setSubscriptionAsync
Analysis
The function executes an Azure CLI command that changes the active Azure subscription:
az account set --subscription ...
The Azure CLI subscription is shared process/environment state.
If two invocations execute concurrently, the commands can overlap and the final active subscription depends on execution ordering.
Dynamic Test
The actual setSubscriptionAsync repository function was imported and executed.
The shell execution dependency was mocked so that the timing of the real function's shell calls could be controlled and observed.
fast-check was used to generate subscription values and exercise concurrent executions.
Observed Result
Concurrent invocations overlapped while issuing commands that modify shared Azure CLI subscription state.
The order in which the operations complete can determine which subscription remains active.
Classification
Race reproduced.
Observed Consequence
Concurrent invocations can overlap while changing shared Azure CLI subscription state, making the resulting subscription depend on execution ordering.
Final Result
Found=Y

3. addAssetsIfNecessary
Repository:
dotnet-vscode-csharp
Source:
src/shared/assets.ts
Location:
780
Function:
addAssetsIfNecessary
Analysis
The function first checks whether the workspace state contains:
assetPromptDisabled
If the value is not set, the function continues and may display a prompt asking the user whether build assets should be created.
If the user selects "Don't Ask Again", the disabled state is written only after the prompt operation completes.
This creates a check-then-act race window.
Two concurrent invocations may both read assetPromptDisabled before either invocation writes the disabled state.
Dynamic Test
The actual repository function was imported and executed.
VS Code workspace APIs, filesystem behavior, task APIs, and related extension dependencies were mocked only to provide a controlled execution environment.
fast-check was used to execute two concurrent invocations with controlled asynchronous timing.
Observed Result
Both invocations were able to pass the assetPromptDisabled check before either invocation recorded the disabled state.
This resulted in two prompts being displayed.
After the execution, the disabled state was set, but the duplicate prompt had already occurred.
Classification
Race reproduced.
Observed Consequence
Two concurrent invocations can both pass the assetPromptDisabled check and display duplicate build-assets prompts before either invocation records the "Don't Ask Again" state.
Final Result
Found=Y

4. showInputBoxWithSettings
Repository:
Dart-Code-Dart-Code
Source:
src/extension/utils/vscode/input.ts
Function:
showInputBoxWithSettings
Analysis
The function creates a VS Code input box and can resolve its Promise from different user events.
Relevant events include:
* accepting the entered value
* selecting the settings button
The fast-check scheduler was used to control the order in which these competing events occur.
Dynamic Test
The actual repository function was imported and executed.
The VS Code InputBox API was mocked to provide a controlled event environment.
fast-check's scheduler executed the accept event and the settings-button event in different orders.
Observed Result
When the accept event resolved first, the function returned the entered value.
Example:
{ value: 'ABC123' }
When the settings-button event resolved first, the function returned:
SETTINGS
Therefore, the return value depends on which legitimate event occurs first.
Classification
No harmful race demonstrated.
Interpretation
The scheduler confirmed timing-dependent behavior, but this alone does not demonstrate a harmful race-condition vulnerability.
The two outcomes correspond to two legitimate user actions.
No evidence was observed of:
* corrupted shared state
* lost updates
* duplicate side effects
* invalid data
* an incorrect return value
* a crash
Therefore, the event-order difference is treated as expected first-event-wins behavior rather than a confirmed harmful race.
Final Result
Found=N
For the final CSV, Location=NA and ObservedConsequence=NA.

5. openOffsetInput
Repository:
microsoft-vscode-hexeditor
Source:
src/util.ts
Function:
openOffsetInput
Analysis
The function calls window.showInputBox() to request an offset from the user.
Concurrent calls can produce overlapping input-box requests.
Dynamic Test
The actual repository function was imported and executed.
The VS Code showInputBox API was mocked so that concurrent prompt timing could be controlled.
fast-check was used to execute concurrent invocations.
Observed Result
Overlapping showInputBox requests were observed.
However, the test did not demonstrate an incorrect returned value, corrupted state, lost update, duplicate persistent side effect, or crash.
Classification
No harmful race demonstrated.
Interpretation
Concurrency was observed, but concurrency alone is not sufficient to classify the behavior as a harmful race-condition vulnerability.
Because no harmful consequence was demonstrated, the final result is negative.
Final Result
Found=N
For the final CSV, Location=NA and ObservedConsequence=NA.

Final Conclusions
The final dynamic validation produced three confirmed race-condition findings:
1. setSubscriptionAsync
2. updateSetting
3. addAssetsIfNecessary
Two additional candidates showed concurrent or timing-dependent behavior but did not demonstrate a harmful race-condition consequence:
1. showInputBoxWithSettings
2. openOffsetInput
Therefore, the final classifications are:
* setSubscriptionAsync — Y
* updateSetting — Y
* addAssetsIfNecessary — Y
* showInputBoxWithSettings — N
* openOffsetInput — N
The authoritative machine-readable results are stored in:
results/race_condition_results.csv
The corresponding dynamic test evidence is stored in the individual *_fastcheck_actual.txt files under the results directory.

