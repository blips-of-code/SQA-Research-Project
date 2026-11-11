import fc from "fast-check";
import mock from "mock-require";

let activeScheduler: any = null;

type ResultType = "SETTINGS" | "VALUE" | "UNDEFINED";

function classifyResult(result: any): ResultType {
    if (result === "SETTINGS") {
        return "SETTINGS";
    }

    if (result && result.value === "ABC123") {
        return "VALUE";
    }

    return "UNDEFINED";
}

function createMockInputBox() {
    let acceptHandler: (() => void) | undefined;
    let buttonHandler: ((event: any) => void) | undefined;
    let hideHandler: (() => void) | undefined;
    let changeHandler: ((value: string) => void) | undefined;

    const input: any = {
        ignoreFocusOut: false,
        title: "",
        prompt: "",
        placeholder: "",
        value: "",
        validationMessage: undefined,
        buttons: [],

        onDidChangeValue(handler: (value: string) => void) {
            changeHandler = handler;
            return { dispose() {} };
        },

        onDidTriggerButton(handler: (event: any) => void) {
            buttonHandler = handler;
            return { dispose() {} };
        },

        onDidAccept(handler: () => void) {
            acceptHandler = handler;
            return { dispose() {} };
        },

        onDidHide(handler: () => void) {
            hideHandler = handler;
            return { dispose() {} };
        },

        hide() {
            if (hideHandler) {
                hideHandler();
            }
        },

        show() {
            /*
             * Both competing UI events are scheduled by fast-check.
             * The scheduler determines which one resolves first.
             */
            activeScheduler
                .schedule(
                    Promise.resolve("accept"),
                    "accept event"
                )
                .then(() => {
                    if (acceptHandler) {
                        acceptHandler();
                    }
                });

            activeScheduler
                .schedule(
                    Promise.resolve("button"),
                    "settings button event"
                )
                .then(() => {
                    if (buttonHandler) {
                        buttonHandler({});
                    }
                });
        },

        dispose() {}
    };

    return input;
}

const vscodeMock = {
    window: {
        createInputBox: () => createMockInputBox()
    },

    Uri: {
        file: (filePath: string) => ({
            fsPath: filePath
        })
    }
};

mock("vscode", vscodeMock);

async function executeTest(
    showInputBoxWithSettings: any,
    scheduler: any
) {
    activeScheduler = scheduler;

    const context: any = {
        asAbsolutePath: (relativePath: string) =>
            `/mock-extension/${relativePath}`
    };

    const options = {
        ignoreFocusOut: true,
        title: "Race Test",
        prompt: "Enter value",
        placeholder: "value",
        value: "ABC123",
        validation: (_value: string) => undefined
    };

    const call = showInputBoxWithSettings(
        context,
        options
    );

    const result = await scheduler.waitFor(call);

    return result;
}

async function main() {
    const inputModule = await import(
        "../candidate-repositories/Dart-Code-Dart-Code/src/extension/utils/vscode/input"
    );

    const showInputBoxWithSettings =
        inputModule.showInputBoxWithSettings;

    if (
        typeof showInputBoxWithSettings !==
        "function"
    ) {
        throw new Error(
            "Could not load the real showInputBoxWithSettings function."
        );
    }

    const observed = new Set<ResultType>();

    const examples: Record<string, any> = {};

    await fc.assert(
        fc.asyncProperty(
            fc.scheduler(),

            async (scheduler) => {
                const result =
                    await executeTest(
                        showInputBoxWithSettings,
                        scheduler
                    );

                const type =
                    classifyResult(result);

                observed.add(type);

                if (!examples[type]) {
                    examples[type] = {
                        result,
                        schedulerReport:
                            scheduler.report()
                    };
                }
            }
        ),

        {
            numRuns: 100
        }
    );

    const timingDependent =
        observed.has("SETTINGS") &&
        observed.has("VALUE");

    console.log(
        "=========================================="
    );

    console.log(
        "Actual repository function tested:"
    );

    console.log(
        "showInputBoxWithSettings"
    );

    console.log(
        "fast-check scheduler runs: 100"
    );

    console.log(
        "Observed result types:",
        Array.from(observed)
    );

    console.log(
        "Timing-dependent result observed:",
        timingDependent ? "Y" : "N"
    );

    if (timingDependent) {
        console.log(
            "Example when value wins:"
        );

        console.dir(
            examples["VALUE"],
            { depth: null }
        );

        console.log(
            "Example when settings wins:"
        );

        console.dir(
            examples["SETTINGS"],
            { depth: null }
        );

        console.log(
            "Observed consequence: fast-check's scheduler demonstrated that competing accept and settings-button events can produce different return values from the real showInputBoxWithSettings function depending on event resolution order."
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
