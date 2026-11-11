import fc from "fast-check";
import mock from "mock-require";

type CallRecord = {
    subscription: string;
    started: number;
    finished?: number;
};

let activeScheduler: any = null;

mock("vscode", {});

async function runRaceTest(
    setSubscriptionAsync: any,
    scheduler: any,
    subscriptionA: string,
    subscriptionB: string
) {
    activeScheduler = scheduler;

    const calls: CallRecord[] = [];
    let sequence = 0;

    const context: any = {
        shell: {
            exec: async (command: string) => {
                const subscription =
                    command.match(/--subscription\s+"([^"]+)"/)?.[1] ??
                    command;

                const record: CallRecord = {
                    subscription,
                    started: sequence++
                };

                calls.push(record);

                await activeScheduler
                    .schedule(
                        Promise.resolve(subscription),
                        `set subscription ${subscription}`
                    )
                    .then(() => {
                        record.finished = sequence++;
                    });

                return {
                    code: 0,
                    stdout: "",
                    stderr: ""
                };
            },

            isUnix: () => true
        }
    };

    const firstCall =
        setSubscriptionAsync(
            context,
            subscriptionA
        );

    const secondCall =
        setSubscriptionAsync(
            context,
            subscriptionB
        );

    await scheduler.waitFor(
        Promise.all([
            firstCall,
            secondCall
        ])
    );

    return calls;
}

async function main() {
    const module = await import(
        "../candidate-repositories/vscode-kubernetes-tools-vscode-kubernetes-tools/src/components/clusterprovider/azure/azure"
    );

    const setSubscriptionAsync =
        module.setSubscriptionAsync;

    if (
        typeof setSubscriptionAsync !==
        "function"
    ) {
        throw new Error(
            "Could not load the real setSubscriptionAsync function."
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
                first,
                second
            ) => {
                fc.pre(first !== second);

                const calls =
                    await runRaceTest(
                        setSubscriptionAsync,
                        scheduler,
                        first,
                        second
                    );

                if (calls.length !== 2) {
                    throw new Error(
                        `Expected two shell calls, got ${calls.length}`
                    );
                }

                const overlap =
                    calls[0].finished !==
                        undefined &&
                    calls[1].started <
                        calls[0].finished;

                if (overlap) {
                    raceObserved = true;

                    if (!example) {
                        example = {
                            calls,
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

    console.log(
        "setSubscriptionAsync"
    );

    console.log(
        "fast-check scheduler runs: 100"
    );

    console.log(
        "Race observed:",
        raceObserved ? "Y" : "N"
    );

    if (raceObserved) {
        console.log(
            "Observed scheduler-controlled overlap:"
        );

        console.dir(example, {
            depth: null
        });

        console.log(
            "Observed consequence: fast-check's scheduler exposed overlapping calls to the real setSubscriptionAsync function while both invocations modify the shared Azure CLI subscription state."
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
