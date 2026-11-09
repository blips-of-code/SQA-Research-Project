const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let workspaceState = {
    assetPromptDisabled: false
};

async function updateWorkspaceState(key, value, delay) {
    const snapshot = { ...workspaceState };

    await sleep(delay);

    snapshot[key] = value;

    workspaceState = snapshot;
}

async function workspaceOperation(name, result, delay) {
    console.log(`${name}: starting`);

    await sleep(delay);

    if (result === "Disable") {
        console.log(`${name}: requesting assetPromptDisabled=true`);

        await updateWorkspaceState(
            "assetPromptDisabled",
            true,
            80
        );
    } else {
        console.log(`${name}: performing normal asset generation`);

        await updateWorkspaceState(
            "lastGeneratedWorkspace",
            name,
            20
        );
    }

    console.log(`${name}: finished`);
}

async function addAssetsIfNecessary() {
    console.log("=== addAssetsIfNecessary Race Test ===\n");

    await Promise.all([
        workspaceOperation("Workspace-A", "Disable", 10),
        workspaceOperation("Workspace-B", "Done", 20)
    ]);

    console.log("\nFinal workspace state:");
    console.log(JSON.stringify(workspaceState, null, 2));

    console.log("\nExpected:");
    console.log("assetPromptDisabled = true");
    console.log("lastGeneratedWorkspace = Workspace-B");

    const correct =
        workspaceState.assetPromptDisabled === true &&
        workspaceState.lastGeneratedWorkspace === "Workspace-B";

    if (correct) {
        console.log(
            "\nRESULT: PASS - No lost workspace-state update observed."
        );
    } else {
        console.log(
            "\nRESULT: RACE REPRODUCED - concurrent workspace-state update was lost."
        );

        if (workspaceState.assetPromptDisabled !== true) {
            console.log("Lost update: assetPromptDisabled");
        }

        if (workspaceState.lastGeneratedWorkspace !== "Workspace-B") {
            console.log("Lost update: lastGeneratedWorkspace");
        }
    }
}

addAssetsIfNecessary().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
