const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const exponentialBackoff = async (retryCount) => {
  const delay = Math.min(1000 * 2 ** retryCount, 30000);
  await sleep(delay);
};

module.exports = { exponentialBackoff };