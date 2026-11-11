const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let activeSubscription = null;

const context = {
    shell: {
        async exec(command) {
            if (command.startsWith("az account set --subscription")) {
                const match = command.match(/"([^"]+)"/);
                activeSubscription = match[1];

                console.log(`SET active subscription -> ${activeSubscription}`);

                return {
                    code: 0,
                    stdout: "",
                    stderr: ""
                };
            }

            if (command.includes("az aks list")) {
                console.log(
                    `LIST command executing with active subscription -> ${activeSubscription}`
                );

                return {
                    code: 0,
                    stdout: JSON.stringify({
                        subscriptionUsed: activeSubscription
                    }),
                    stderr: ""
                };
            }

            return {
                code: 0,
                stdout: "",
                stderr: ""
            };
        }
    }
};

async function setSubscriptionAsync(context, subscription) {
    return context.shell.exec(
        `az account set --subscription "${subscription}"`
    );
}

async function operationA() {
    await setSubscriptionAsync(context, "SUB-A");

    // Simulate work occurring before the next Azure command.
    await sleep(100);

    const result = await context.shell.exec("az aks list");

    return {
        operation: "Operation-A",
        expected: "SUB-A",
        actual: JSON.parse(result.stdout).subscriptionUsed
    };
}

async function operationB() {
    // Allow Operation A to set SUB-A first.
    await sleep(20);

    await setSubscriptionAsync(context, "SUB-B");

    const result = await context.shell.exec("az aks list");

    return {
        operation: "Operation-B",
        expected: "SUB-B",
        actual: JSON.parse(result.stdout).subscriptionUsed
    };
}

async function runTest() {
    console.log("=== Azure Shared Subscription Race Test ===\n");

    const results = await Promise.all([
        operationA(),
        operationB()
    ]);

    console.log("\nResults:");

    for (const r of results) {
        console.log(
            `${r.operation}: expected=${r.expected}, actual=${r.actual}`
        );
    }

    const mismatches = results.filter(
        r => r.expected !== r.actual
    );

    if (mismatches.length > 0) {
        console.log(
            "\nRESULT: RACE REPRODUCED - shared subscription state was changed by another operation."
        );

        for (const r of mismatches) {
            console.log(
                `${r.operation} expected ${r.expected} but executed using ${r.actual}`
            );
        }
    } else {
        console.log(
            "\nRESULT: No race reproduced in this controlled schedule."
        );
    }
}

runTest().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
