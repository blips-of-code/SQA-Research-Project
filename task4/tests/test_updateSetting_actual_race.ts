import fc from "fast-check";
import mock from "mock-require";
import path from "path";

let committedVirtualFolders: any[] = [];
let activeScheduler: any = null;

const clone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value));

const vscodeMock = {
    workspace: {
        getConfiguration: () => ({
            get: (key: string) => {
                if (key === "virtualFolders") {
                    return clone(committedVirtualFolders);
                }

                return undefined;
            },

            update: async (key: string, value: any) => {
                if (key !== "virtualFolders") {
                    return;
                }

                const snapshot = clone(value);

                await activeScheduler
                    .schedule(
                        Promise.resolve(snapshot),
                        "commit virtualFolders"
                    )
                    .then((scheduledValue: any[]) => {
                        committedVirtualFolders =
                            clone(scheduledValue);
                    });
            },

            inspect: () => undefined
        })
    }
};

mock("vscode", vscodeMock);

const virtualWorkspaceModule = path.resolve(
    process.cwd(),
    "candidate-repositories/jest-community-vscode-jest/src/virtual-workspace-folder.ts"
);

mock(virtualWorkspaceModule, {
    isVirtualWorkspaceFolder: () => true
});

async function runRaceTest(
    updateSetting: any,
    scheduler: any,
    firstValue: string,
    secondValue: string
) {
    activeScheduler = scheduler;

    committedVirtualFolders = [
        {
            name: "workspace-A",
            jestCommandLine: "initial-A"
        },
        {
            name: "workspace-B",
            jestCommandLine: "initial-B"
        }
    ];

    const workspaceA: any = {
        name: "workspace-A",
        uri: { fsPath: "/tmp/workspace-A" }
    };

    const workspaceB: any = {
        name: "workspace-B",
        uri: { fsPath: "/tmp/workspace-B" }
    };

    const firstCall = updateSetting(
        workspaceA,
        "jestCommandLine",
        firstValue
    );

    const secondCall = updateSetting(
        workspaceB,
        "jestCommandLine",
        secondValue
    );

    await scheduler.waitFor(
        Promise.all([
            firstCall,
            secondCall
        ])
    );

    return clone(committedVirtualFolders);
}

async function main() {
    const helperModule = await import(
        "../candidate-repositories/jest-community-vscode-jest/src/Settings/helper"
    );

    const updateSetting =
        helperModule.updateSetting;

    if (typeof updateSetting !== "function") {
        throw new Error(
            "Could not load the real updateSetting function."
        );
    }

    let raceObserved = false;
    let example: any = null;

    await fc.assert(
        fc.asyncProperty(
            fc.scheduler(),

            fc.string({
                minLength: 1,
                maxLength: 20
            }),

            fc.string({
                minLength: 1,
                maxLength: 20
            }),

            async (
                scheduler,
                valueA,
                valueB
            ) => {
                fc.pre(valueA !== valueB);

                const finalState =
                    await runRaceTest(
                        updateSetting,
                        scheduler,
                        valueA,
                        valueB
                    );

                const folderA =
                    finalState.find(
                        (v: any) =>
                            v.name === "workspace-A"
                    );

                const folderB =
                    finalState.find(
                        (v: any) =>
                            v.name === "workspace-B"
                    );

                const bothUpdatesPreserved =
                    folderA?.jestCommandLine ===
                        valueA &&
                    folderB?.jestCommandLine ===
                        valueB;

                if (!bothUpdatesPreserved) {
                    raceObserved = true;

                    if (!example) {
                        example = {
                            expected: {
                                workspaceA: valueA,
                                workspaceB: valueB
                            },

                            actual: finalState,

                            schedulerReport:
                                scheduler.report()
                        };
                    }
                }
            }
        ),

        {
            numRuns: 100
        }
    );

    console.log(
        "=========================================="
    );

    console.log(
        "Actual repository function tested:"
    );

    console.log("updateSetting");

    console.log(
        "fast-check scheduler runs: 100"
    );

    console.log(
        "Race observed:",
        raceObserved ? "Y" : "N"
    );

    if (raceObserved) {
        console.log(
            "Observed lost-update example:"
        );

        console.dir(example, {
            depth: null
        });

        console.log(
            "Observed consequence: fast-check's scheduler exposed a lost-update race in which concurrent updateSetting calls read independent virtualFolders snapshots and one complete-array write overwrites the other."
        );
    }

    console.log(
        "=========================================="
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
