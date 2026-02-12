const sleep = ms => new Promise(r => setTimeout(r, ms));

const expectHttpError = async (requestFn, expectedStatus) => {
  const maxRetries = 5;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await requestFn();
    } catch (error) {
      // Infra failure → retry
      if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT'
      ) {
        console.log(`⚠️ transient infra error, retry ${i+1}/${maxRetries}`);
        await sleep(1000);
        continue;
      }

      // HTTP error → assert
      if (error.response) {
        expect(error.response.status).toBe(expectedStatus);
        return;
      }

      throw error;
    }
  }

  throw new Error('Request never succeeded due to infra instability');
};

module.exports = { expectHttpError };
