import fc from "fast-check";
import mock from "mock-require";

type EventName = "accept" | "button";

let requestedOrder: EventName[] = [];

function createMockInputBox() {
    let acceptHandler: (() => void) | undefined;
    let buttonHandler: ((e: any) => void) | undefined;
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

        onDidTriggerButton(handler: (e: any) => void) {
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
             * Fire the same two user events in the order supplied
             * by fast-check. The actual repository callback logic
             * decides which result wins.
             */
            setTimeout(() => {
                for (const event of requestedOrder) {
                    if (event === "accept" && acceptHandler) {
                        acceptHandler();
                    }

                    if (event === "button" && buttonHandler) {
                        buttonHandler({});
                    }
                }
            }, 0);
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
        file: (path: string) => ({ fsPath: path })
    }
};

mock("vscode", vscodeMock);

async function executeTest(
    showInputBoxWithSettings: any,
    order: EventName[]
) {
    requestedOrder = order;

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

    return await showInputBoxWithSettings(
        context,
        options
    );
}

async function main() {
    const inputModule = await import(
        "../candidate-repositories/Dart-Code-Dart-Code/src/extension/utils/vscode/input"
    );

    const showInputBoxWithSettings =
        inputModule.showInputBoxWithSettings;

    if (typeof showInputBoxWithSettings !== "function") {
        throw new Error(
            "Could not load the real showInputBoxWithSettings function."
        );
    }

    let timingDependentResultObserved = false;
    let example: any = null;

    await fc.assert(
        fc.asyncProperty(
            fc.boolean(),
            async (buttonFirst) => {
                const firstOrder: EventName[] =
                    buttonFirst
                        ? ["button", "accept"]
                        : ["accept", "button"];

                const reverseOrder: EventName[] =
                    buttonFirst
                        ? ["accept", "button"]
                        : ["button", "accept"];

                const result1 = await executeTest(
                    showInputBoxWithSettings,
                    firstOrder
                );

                const result2 = await executeTest(
                    showInputBoxWithSettings,
                    reverseOrder
                );

                const serialized1 =
                    JSON.stringify(result1);

                const serialized2 =
                    JSON.stringify(result2);

                if (serialized1 !== serialized2) {
                    timingDependentResultObserved = true;

                    if (!example) {
                        example = {
                            order1: firstOrder,
                            result1,
                            order2: reverseOrder,
                            result2
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

    console.log("showInputBoxWithSettings");

    console.log("fast-check runs: 100");

    console.log(
        "Timing-dependent result observed:",
        timingDependentResultObserved ? "Y" : "N"
    );

    if (timingDependentResultObserved) {
        console.log(
            "Observed event-order example:"
        );

        console.dir(example, {
            depth: null
        });

        console.log(
            "Observed consequence: when accept and settings-button events occur in different orders, showInputBoxWithSettings returns different results. The result therefore depends on which competing event resolves the Promise first."
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
