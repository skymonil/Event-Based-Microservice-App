// tests/common/waitFor.js

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls a condition function until it returns true or timeout occurs.
 * @param {Function} conditionFn - Function returning boolean (true = pass)
 * @param {number} timeoutMs - Max wait time
 * @param {string} errorMsg - Message to throw on timeout
 */
export const waitFor = async (
    conditionFn,
    timeoutMs = 10000,
    errorMsg = "Condition timed out",
) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            if (await conditionFn()) return true;
        } catch (_e) {
            // Ignore intermediate errors while waiting for service to spin up
        }
        await wait(500); // Poll every 500ms
    }
    throw new Error(`${errorMsg} after ${timeoutMs}ms`);
};