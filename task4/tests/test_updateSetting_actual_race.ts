import fc from "fast-check";
import mock from "mock-require";
import path from "path";

// ---------------------------------------------------------
// Mock ONLY external/environment dependencies.
// We will still execute the REAL updateSetting function.
// ---------------------------------------------------------

let committedVirtualFolders: any[] = [];

const vscodeMock = {
    workspace: {
        getConfiguration: () => ({
            get: (key: string) => {
                if (key === "virtualFolders") {
                    // Return a snapshot, like independently-read configuration state.
                    return JSON.parse(JSON.stringify(committedVirtualFolders));
                }

                return undefined;
            },

            update: async (key: string, value: any) => {
                // Introduce async timing so concurrent updates may interleave.
                await new Promise((resolve) =>
                    setTimeout(resolve, Math.floor(Math.random() * 5))
                );

                if (key === "virtualFolders") {
                    committedVirtualFolders =
                        JSON.parse(JSON.stringify(value));
                }
            },

            inspect: () => undefined
        })
    }
};

mock("vscode", vscodeMock);

// Force the selected workspaces down the virtual-workspace branch.
const virtualWorkspaceModule = path.resolve(
    process.cwd(),
    "candidate-repositories/jest-community-vscode-jest/src/virtual-workspace-folder.ts"
);

mock(virtualWorkspaceModule, {
    isVirtualWorkspaceFolder: () => true
});

async function runRaceTest(
    updateSetting: any,
    firstValue: string,
    secondValue: string
) {
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

    await Promise.all([
        updateSetting(
            workspaceA,
            "jestCommandLine",
            firstValue
        ),

        updateSetting(
            workspaceB,
            "jestCommandLine",
            secondValue
        )
    ]);

    return JSON.parse(
        JSON.stringify(committedVirtualFolders)
    );
}

async function main() {
    const helperModule = await import(
        "../candidate-repositories/jest-community-vscode-jest/src/Settings/helper"
    );

    const updateSetting = helperModule.updateSetting;

    if (typeof updateSetting !== "function") {
        throw new Error(
            "Could not load the real updateSetting function."
        );
    }

    let raceObserved = false;
    let example: any = null;

    await fc.assert(
        fc.asyncProperty(
            fc.string({
                minLength: 1,
                maxLength: 20
            }),

            fc.string({
                minLength: 1,
                maxLength: 20
            }),

            async (valueA, valueB) => {
                fc.pre(valueA !== valueB);

                const finalState = await runRaceTest(
                    updateSetting,
                    valueA,
                    valueB
                );

                const folderA = finalState.find(
                    (v: any) => v.name === "workspace-A"
                );

                const folderB = finalState.find(
                    (v: any) => v.name === "workspace-B"
                );

                const bothUpdatesPreserved =
                    folderA?.jestCommandLine === valueA &&
                    folderB?.jestCommandLine === valueB;

                if (!bothUpdatesPreserved) {
                    raceObserved = true;

                    if (!example) {
                        example = {
                            expected: {
                                workspaceA: valueA,
                                workspaceB: valueB
                            },

                            actual: finalState
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

    console.log("fast-check runs: 100");

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
            "Observed consequence: concurrent updateSetting calls can overwrite each other's virtualFolders changes because each call reads a snapshot and later writes the entire array."
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
