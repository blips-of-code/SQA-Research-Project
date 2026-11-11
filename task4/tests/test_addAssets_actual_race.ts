import fc from "fast-check";
import mock from "mock-require";

// ---------------------------------------------------------
// This test executes the REAL addAssetsIfNecessary function.
// Only VS Code, filesystem, and extension-environment
// dependencies are mocked.
// ---------------------------------------------------------

let promptCount = 0;
let workspaceStateDisabled = false;

let fsDelay = 0;
let promptDelay = 0;

// Mock filesystem checks used by getOperations().
// Returning false means tasks.json and launch.json are absent,
// which causes the real code to determine that assets are missing.
mock("fs-extra", {
    exists: (_path: string, callback: (exists: boolean) => void) => {
        setTimeout(() => callback(false), fsDelay);
    },

    pathExistsSync: () => false,

    ensureDir: async () => {},

    readFileSync: () => "",

    readFile: (
        _path: string,
        callback: (err: any, data?: Buffer) => void
    ) => {
        setTimeout(() => {
            callback(null, Buffer.from(""));
        }, fsDelay);
    },

    writeFile: (
        _path: string,
        _data: any,
        callback: (err?: any) => void
    ) => {
        setTimeout(() => callback(), fsDelay);
    }
});

// assets.ts imports vscode-tasks at module load time.
// It is not needed for the path tested here.
mock("vscode-tasks", {});

const workspaceFolder = {
    name: "race-workspace",

    uri: {
        fsPath: "/tmp/race-workspace"
    }
};

const vscodeMock = {
    workspace: {
        workspaceFolders: [workspaceFolder],

        getConfiguration: (_section: string) => ({
            has: (_key: string) => false,

            get: (_key: string) => false
        })
    },

    window: {
        showWarningMessage: async (
            _message: string,
            ...items: any[]
        ) => {
            promptCount++;

            /*
             * Allow the two real addAssetsIfNecessary calls
             * to overlap before either finishes.
             */
            await new Promise((resolve) =>
                setTimeout(resolve, promptDelay)
            );

            // Select the real "Don't Ask Again" item.
            const disableItem = items.find(
                (item) =>
                    item &&
                    item.title === "Don't Ask Again"
            );

            if (!disableItem) {
                throw new Error(
                    "Could not locate Don't Ask Again prompt item."
                );
            }

            return disableItem;
        },

        showQuickPick: async () => undefined
    },

    l10n: {
        t: (message: string, ...args: any[]) => {
            let result = message;

            args.forEach((arg, index) => {
                result = result.replace(
                    `{${index}}`,
                    String(arg)
                );
            });

            return result;
        }
    }
};

mock("vscode", vscodeMock);

async function runConcurrentTest(
    addAssetsIfNecessary: any,
    delayA: number,
    delayB: number
) {
    promptCount = 0;
    workspaceStateDisabled = false;

    fsDelay = delayA;
    promptDelay = delayB;

    const context: any = {
        workspaceState: {
            get: (key: string) => {
                if (key === "assetPromptDisabled") {
                    return workspaceStateDisabled;
                }

                return undefined;
            },

            update: async (
                key: string,
                value: boolean
            ) => {
                if (key === "assetPromptDisabled") {
                    workspaceStateDisabled = value;
                }
            }
        }
    };

    /*
     * This object satisfies the ACTUAL conditions checked by
     * AssetGenerator.findExecutableMSBuildProjects():
     *
     * project.isExe === true
     * project.targetsDotnetCore === true
     */
    const projectInfo: any = {
        isExe: true,
        targetsDotnetCore: true,
        isBlazorWebAssemblyStandalone: false,
        isBlazorWebAssemblyHosted: false,
        isWebProject: false,

        projectName: "RaceProject",

        projectPath:
            "/tmp/race-workspace/RaceProject.csproj",

        outputPath:
            "/tmp/race-workspace/bin/RaceProject.dll"
    };

    const workspaceInformationProvider: any = {
        getWorkspaceDebugInformation:
            async (_uri: any) => {
                // Yield so concurrent invocations can interleave.
                await new Promise((resolve) =>
                    setTimeout(resolve, delayA)
                );

                return [projectInfo];
            }
    };

    await Promise.all([
        addAssetsIfNecessary(
            context,
            workspaceInformationProvider
        ),

        addAssetsIfNecessary(
            context,
            workspaceInformationProvider
        )
    ]);

    return {
        promptCount,
        workspaceStateDisabled
    };
}

async function main() {
    const assetsModule = await import(
        "../candidate-repositories/dotnet-vscode-csharp/src/shared/assets"
    );

    const addAssetsIfNecessary =
        assetsModule.addAssetsIfNecessary;

    if (
        typeof addAssetsIfNecessary !==
        "function"
    ) {
        throw new Error(
            "Could not load the real addAssetsIfNecessary function."
        );
    }

    let duplicatePromptObserved = false;
    let example: any = null;

    await fc.assert(
        fc.asyncProperty(
            fc.integer({
                min: 0,
                max: 5
            }),

            fc.integer({
                min: 0,
                max: 5
            }),

            async (
                firstDelay,
                secondDelay
            ) => {
                const result =
                    await runConcurrentTest(
                        addAssetsIfNecessary,
                        firstDelay,
                        secondDelay
                    );

                /*
                 * If "Don't Ask Again" truly serialized
                 * concurrent calls immediately, only one prompt
                 * should occur.
                 *
                 * More than one prompt demonstrates that both
                 * invocations passed the initial disabled-state
                 * check before either committed the update.
                 */
                if (
                    result.promptCount > 1 &&
                    result.workspaceStateDisabled
                ) {
                    duplicatePromptObserved = true;

                    if (!example) {
                        example = {
                            firstDelay,
                            secondDelay,
                            ...result
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

    console.log(
        "addAssetsIfNecessary"
    );

    console.log(
        "fast-check runs: 100"
    );

    console.log(
        "Duplicate prompt race observed:",
        duplicatePromptObserved
            ? "Y"
            : "N"
    );

    if (duplicatePromptObserved) {
        console.log(
            "Observed example:"
        );

        console.dir(example, {
            depth: null
        });

        console.log(
            "Observed consequence: two concurrent addAssetsIfNecessary invocations can both pass the assetPromptDisabled check and display duplicate build-assets prompts before either invocation records the Don't Ask Again state."
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
