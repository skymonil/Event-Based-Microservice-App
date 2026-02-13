const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const config = require('./config');

const createClient = (baseUrl = config.baseUrl) => {
  const client = axios.create({
    baseURL: baseUrl,
    timeout: config.timeouts.http,
    validateStatus: () => true,
    headers: {
      'Content-Type': 'application/json',
      'x-synthetic-test': 'true' // Tag traffic so we can filter it in Prometheus/Logs
    }
  });

  // Retry 3 times on network errors or 5xx responses (Service Unavailable)
  axiosRetry(client, { 
    retries: 3, 
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
             (error.response && error.response.status >= 500);
    }
  });

  return client;
};

module.exports = { createClient };