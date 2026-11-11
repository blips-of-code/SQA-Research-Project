# Task 4 - Dynamic Validation of Race-Condition Candidates

## Objective

Static analysis identified asynchronous TypeScript functions that may contain race-condition risks. The highest-priority candidates were manually inspected and then evaluated using controlled dynamic test harnesses.

The dynamic tests do not claim that every reproduced behavior is a confirmed production bug in the original VS Code extension. They demonstrate whether the suspected concurrency pattern can be reproduced under controlled scheduling.

## Validation Results

| Repository | Function | Static Score | Dynamic Result |
|---|---|---:|---|
| jest-community-vscode-jest | updateSetting | 9 | Race reproduced |
| vscode-kubernetes-tools-vscode-kubernetes-tools | setSubscriptionAsync | 8 | Race reproduced |
| dotnet-vscode-csharp | addAssetsIfNecessary | 9 | Inconclusive |
| Dart-Code-Dart-Code | showInputBoxWithSettings | 8 | Not reproduced |
| microsoft-vscode-hexeditor | openOffsetInput | 8 | Not reproduced |

## 1. updateSetting

Repository:
jest-community-vscode-jest

Source:
src/Settings/helper.ts

The function follows a read-modify-write pattern on the virtualFolders configuration.

Two controlled concurrent updates were executed on different folder entries.

Expected:

- FolderA = newA
- FolderB = newB

Observed:

- FolderA = newA
- FolderB = oldB

One update was overwritten by the other operation.

Classification:

Race reproduced in controlled model.

Evidence:

task4/results/updateSetting_race_test.txt


## 2. setSubscriptionAsync

Repository:
vscode-kubernetes-tools-vscode-kubernetes-tools

Source:
src/components/clusterprovider/azure/azure.ts

The function changes the active Azure CLI subscription using:

az account set --subscription

A controlled test executed two operations using different subscriptions concurrently.

Operation A expected SUB-A but later executed while SUB-B was active.

Classification:

Race reproduced in controlled model.

Evidence:

task4/results/setSubscription_race_test.txt


## 3. addAssetsIfNecessary

Repository:
dotnet-vscode-csharp

Source:
src/shared/assets.ts

The initial test harness appeared to reproduce a lost update. However, inspection showed that the harness introduced concurrent workspace-state writes that are not present in the original function.

Therefore, that result cannot be used as evidence of a race in the original candidate.

Classification:

Inconclusive.


## 4. showInputBoxWithSettings

Repository:
Dart-Code-Dart-Code

Source:
src/extension/utils/vscode/input.ts

The function registers multiple handlers capable of resolving the same Promise.

Controlled event ordering tested:

- Accept followed by Hide
- Settings-button action followed by Hide

In both cases, the first Promise resolution was preserved and later resolutions were ignored.

Classification:

No harmful race reproduced in the controlled test; likely static false positive.

Evidence:

task4/results/showInputBox_race_test.txt


## 5. openOffsetInput

Repository:
microsoft-vscode-hexeditor

Source:
src/util.ts

Two concurrent calls were executed with independent input values.

Both calls returned their expected values without interference.

Classification:

No harmful race reproduced in the controlled test; likely static false positive.

Evidence:

task4/results/openOffsetInput_race_test.txt


## Current Findings

Five high-priority candidates were dynamically investigated.

Results:

- Race reproduced in controlled model: 2
- Inconclusive: 1
- Not reproduced / likely false positive: 2

The results demonstrate why static race-condition detection should be followed by dynamic validation. High static scores identify suspicious concurrency patterns but do not necessarily imply that a harmful race exists during execution.
