import fc from "fast-check";
import mock from "mock-require";

type PromptRecord = {
    id: number;
    start: number;
    finish?: number;
};

let prompts: PromptRecord[] = [];
let sequence = 0;
let promptId = 0;

const vscodeMock = {
    l10n: {
        t: (message: string) => message
    },

    window: {
        showInputBox: async (_options: any) => {
            const record: PromptRecord = {
                id: promptId++,
                start: sequence++
            };

            prompts.push(record);

            // Simulate an asynchronous VS Code input interaction.
            await new Promise((resolve) =>
                setTimeout(resolve, Math.floor(Math.random() * 5) + 1)
            );

            record.finish = sequence++;

            return "ABC123";
        }
    }
};

mock("vscode", vscodeMock);

async function runConcurrentTest(openOffsetInput: any) {
    prompts = [];
    sequence = 0;
    promptId = 0;

    const results = await Promise.all([
        openOffsetInput(),
        openOffsetInput()
    ]);

    return {
        prompts: JSON.parse(JSON.stringify(prompts)),
        results
    };
}

async function main() {
    const utilModule = await import(
        "../candidate-repositories/microsoft-vscode-hexeditor/src/util"
    );

    const openOffsetInput = utilModule.openOffsetInput;

    if (typeof openOffsetInput !== "function") {
        throw new Error(
            "Could not load the real openOffsetInput function."
        );
    }

    let overlapObserved = false;
    let example: any = null;

    await fc.assert(
        fc.asyncProperty(
            fc.integer({ min: 1, max: 1000 }),
            async (_runId) => {
                const result =
                    await runConcurrentTest(openOffsetInput);

                if (result.prompts.length !== 2) {
                    throw new Error(
                        `Expected 2 showInputBox calls, got ${result.prompts.length}`
                    );
                }

                const first = result.prompts[0];
                const second = result.prompts[1];

                const overlap =
                    first.finish !== undefined &&
                    second.start < first.finish;

                if (overlap) {
                    overlapObserved = true;

                    if (!example) {
                        example = result;
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

    console.log("openOffsetInput");

    console.log("fast-check runs: 100");

    console.log(
        "Concurrent UI overlap observed:",
        overlapObserved ? "Y" : "N"
    );

    if (overlapObserved) {
        console.log(
            "Observed overlapping prompt example:"
        );

        console.dir(example, {
            depth: null
        });

        console.log(
            "Observed consequence: concurrent openOffsetInput invocations can issue overlapping showInputBox requests because the function contains no serialization or coordination between calls."
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
