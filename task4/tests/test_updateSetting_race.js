// Dynamic race-condition test for jest-community-vscode-jest updateSetting()
// Candidate: src/Settings/helper.ts :: updateSetting
//
// The original function performs:
//   1. Read virtualFolders
//   2. Modify one entry
//   3. Await writing the whole virtualFolders array
//
// This test intentionally launches two concurrent updates to determine
// whether one update can overwrite the other.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class MockConfig {
    constructor() {
        this.virtualFolders = [
            { name: "FolderA", enable: true, value: "oldA" },
            { name: "FolderB", enable: true, value: "oldB" }
        ];
    }

    get(key) {
        if (key !== "virtualFolders") {
            return undefined;
        }

        // Simulate VS Code returning a snapshot of the configuration.
        return JSON.parse(JSON.stringify(this.virtualFolders));
    }

    async update(key, value) {
        if (key !== "virtualFolders") {
            return;
        }

        // Delay the write so concurrent calls can overlap.
        await sleep(50);

        this.virtualFolders = JSON.parse(JSON.stringify(value));
    }
}

const config = new MockConfig();

async function updateSetting(workspaceFolder, key, value) {
    const virtualFolders = config.get("virtualFolders");

    const vFolder = virtualFolders?.find(
        (v) => v.name === workspaceFolder.name
    );

    if (!vFolder) {
        throw new Error(
            `[${workspaceFolder.name}] is missing corresponding virtual folder setting`
        );
    }

    // Same read-modify-write pattern as the candidate function.
    vFolder[key] = value;

    // Different delay makes the two writes interleave predictably.
    if (workspaceFolder.name === "FolderA") {
        await sleep(100);
    } else {
        await sleep(10);
    }

    await config.update("virtualFolders", virtualFolders);
}

async function runTest() {
    console.log("=== Race Condition Dynamic Test ===");
    console.log("\nInitial state:");
    console.log(JSON.stringify(config.virtualFolders, null, 2));

    console.log("\nLaunching two concurrent updateSetting() calls...");

    await Promise.all([
        updateSetting(
            { name: "FolderA" },
            "value",
            "newA"
        ),
        updateSetting(
            { name: "FolderB" },
            "value",
            "newB"
        )
    ]);

    console.log("\nFinal state:");
    console.log(JSON.stringify(config.virtualFolders, null, 2));

    const folderA = config.virtualFolders.find(
        (v) => v.name === "FolderA"
    );

    const folderB = config.virtualFolders.find(
        (v) => v.name === "FolderB"
    );

    console.log("\nExpected:");
    console.log("FolderA = newA");
    console.log("FolderB = newB");

    console.log("\nObserved:");
    console.log(`FolderA = ${folderA.value}`);
    console.log(`FolderB = ${folderB.value}`);

    if (
        folderA.value === "newA" &&
        folderB.value === "newB"
    ) {
        console.log("\nRESULT: PASS - No lost update observed.");
    } else {
        console.log(
            "\nRESULT: RACE REPRODUCED - A concurrent update was lost."
        );

        if (folderA.value !== "newA") {
            console.log("Lost update: FolderA");
        }

        if (folderB.value !== "newB") {
            console.log("Lost update: FolderB");
        }
    }
}

runTest().catch((error) => {
    console.error("Test failed:", error);
    process.exitCode = 1;
});


