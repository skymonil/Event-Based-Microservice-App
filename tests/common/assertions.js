const { expect } = require('@jest/globals');

/**
 * Asserts that an Axios promise rejects with a specific status code.
 */
const expectHttpError = async (promise, statusCode) => {
  try {
    await promise;
  } catch (error) {
    if (error.response) {
      expect(error.response.status).toBe(statusCode);
      return;
    }
    throw error; // Re-throw if it's not an HTTP error
  }
  throw new Error(`Expected HTTP ${statusCode} but request succeeded`);
};

module.exports = { expectHttpError };