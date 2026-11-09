const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function validateInput(text) {
    return text.length > 8 || /^[a-fA-F0-9]+$/.test(text)
        ? null
        : "Invalid offset string";
}

async function mockShowInputBox(value, delay) {
    await sleep(delay);

    const validation = validateInput(value);

    if (validation) {
        return {
            value: undefined,
            validation
        };
    }

    return {
        value,
        validation: null
    };
}

async function openOffsetInput(value, delay) {
    return mockShowInputBox(value, delay);
}

async function runTest() {
    console.log("=== openOffsetInput Concurrent Test ===\n");

    const results = await Promise.all([
        openOffsetInput("1A2B", 50),
        openOffsetInput("FFEE", 10)
    ]);

    console.log("Concurrent results:");
    console.log("Call A:", results[0]);
    console.log("Call B:", results[1]);

    const correct =
        results[0].value === "1A2B" &&
        results[1].value === "FFEE";

    if (correct) {
        console.log(
            "\nRESULT: NO HARMFUL RACE REPRODUCED - concurrent calls remained independent."
        );
    } else {
        console.log(
            "\nRESULT: POTENTIAL RACE - concurrent calls interfered."
        );
    }
}

runTest().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
