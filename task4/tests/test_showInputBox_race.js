const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class MockInputBox {
    constructor() {
        this.value = "Bhuvana";
        this.validationMessage = undefined;
        this.acceptHandlers = [];
        this.hideHandlers = [];
        this.buttonHandlers = [];
    }

    onDidAccept(fn) {
        this.acceptHandlers.push(fn);
    }

    onDidHide(fn) {
        this.hideHandlers.push(fn);
    }

    onDidTriggerButton(fn) {
        this.buttonHandlers.push(fn);
    }

    show() {}

    hide() {
        for (const fn of this.hideHandlers) {
            fn();
        }
    }

    dispose() {}

    triggerAccept() {
        for (const fn of this.acceptHandlers) {
            fn();
        }
    }

    triggerButton() {
        for (const fn of this.buttonHandlers) {
            fn({});
        }
    }
}

async function showInputBoxWithSettings(input) {
    const result = await new Promise(resolve => {
        input.onDidTriggerButton(() => {
            resolve("SETTINGS");
            input.hide();
        });

        input.onDidAccept(() => {
            if (input.validationMessage) {
                return;
            }

            input.value
                ? resolve({ value: input.value })
                : resolve(undefined);
        });

        input.onDidHide(() => {
            resolve(undefined);
        });

        input.show();
    });

    input.dispose();
    return result;
}

async function testAcceptThenHide() {
    const input = new MockInputBox();

    const promise = showInputBoxWithSettings(input);

    await sleep(10);
    input.triggerAccept();
    input.hide();

    return promise;
}

async function testButtonThenHide() {
    const input = new MockInputBox();

    const promise = showInputBoxWithSettings(input);

    await sleep(10);
    input.triggerButton();

    return promise;
}

async function run() {
    console.log("=== showInputBoxWithSettings Concurrency Test ===\n");

    const acceptResult = await testAcceptThenHide();

    console.log("Test 1: Accept followed by Hide");
    console.log("Expected first result: { value: 'Bhuvana' }");
    console.log("Observed:", acceptResult);

    const buttonResult = await testButtonThenHide();

    console.log("\nTest 2: Settings button followed by automatic Hide");
    console.log("Expected first result: SETTINGS");
    console.log("Observed:", buttonResult);

    const acceptCorrect =
        acceptResult &&
        acceptResult.value === "Bhuvana";

    const buttonCorrect =
        buttonResult === "SETTINGS";

    if (acceptCorrect && buttonCorrect) {
        console.log(
            "\nRESULT: NO HARMFUL RACE REPRODUCED - later Promise resolutions were ignored."
        );
    } else {
        console.log(
            "\nRESULT: POTENTIAL RACE - unexpected result observed."
        );
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
