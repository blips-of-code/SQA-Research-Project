import fc from "fast-check";
import mock from "mock-require";

// The real repository is a VS Code extension.
// Plain Node does not provide the "vscode" runtime module,
// so we mock that external environment before loading the real source.
mock("vscode", {});

type CallRecord = {
    subscription: string;
    start: number;
    finish?: number;
};

async function runRaceTest(
    setSubscriptionAsync: any,
    subscriptionA: string,
    subscriptionB: string
) {
    const calls: CallRecord[] = [];
    let sequence = 0;

    const context: any = {
        shell: {
            exec: async (command: string) => {
                const subscription =
                    command.match(/--subscription\s+"([^"]+)"/)?.[1] ?? command;

                const record: CallRecord = {
                    subscription,
                    start: sequence++
                };

                calls.push(record);

                // Yield so the two real function calls can overlap.
                await new Promise((resolve) =>
                    setTimeout(resolve, Math.floor(Math.random() * 5))
                );

                record.finish = sequence++;

                return {
                    code: 0,
                    stdout: "",
                    stderr: ""
                };
            },

            isUnix: () => true
        }
    };

    await Promise.all([
        setSubscriptionAsync(context, subscriptionA),
        setSubscriptionAsync(context, subscriptionB)
    ]);

    return calls;
}

async function main() {
    // Import AFTER registering the VS Code mock.
    const module = await import(
        "../candidate-repositories/vscode-kubernetes-tools-vscode-kubernetes-tools/src/components/clusterprovider/azure/azure"
    );

    const setSubscriptionAsync = module.setSubscriptionAsync;

    if (typeof setSubscriptionAsync !== "function") {
        throw new Error(
            "Could not load the real setSubscriptionAsync function from the repository."
        );
    }

    let observedRace = false;
    let observedExample: CallRecord[] = [];

    await fc.assert(
        fc.asyncProperty(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.string({ minLength: 1, maxLength: 20 }),
            async (first, second) => {
                fc.pre(first !== second);

                const calls = await runRaceTest(
                    setSubscriptionAsync,
                    first,
                    second
                );

                if (calls.length !== 2) {
                    throw new Error(
                        `Expected two shell executions, got ${calls.length}`
                    );
                }

                if (
                    calls[0].finish !== undefined &&
                    calls[1].finish !== undefined &&
                    calls[1].start < calls[0].finish
                ) {
                    observedRace = true;
                    observedExample = calls;
                }
            }
        ),
        {
            numRuns: 100
        }
    );

    console.log("==========================================");
    console.log("Actual repository function tested:");
    console.log("setSubscriptionAsync");
    console.log("fast-check runs: 100");
    console.log("Race observed:", observedRace ? "Y" : "N");

    if (observedRace) {
        console.log("Observed overlapping calls:");
        console.log(observedExample);

        console.log(
            "Observed consequence: concurrent invocations overlap while changing shared Azure CLI subscription state."
        );
    }

    console.log("==========================================");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

