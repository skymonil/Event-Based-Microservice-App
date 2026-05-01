// tests/common/httpClient.js
import axios from "axios";
// 🟢 Use the 'default' import or the direct path if the main one fails
import axiosRetry from "axios-retry";
import config from "./config.js";

// Inside createClient...
const retry = axiosRetry.default || axiosRetry;

export const createClient = (baseUrl = config.baseUrl) => {
    const client = axios.create({
        baseURL: baseUrl,
        timeout: config.timeouts.http,
        validateStatus: () => true,
        headers: {
            "Content-Type": "application/json",
            "x-synthetic-test": "true",
        },
    });

    // 🟢 Call it using the extracted 'retry' variable
    retry(client, {
        retries: 3,
        retryDelay: axiosRetry.exponentialDelay || (() => 1000), 
        retryCondition: (error) => {
            return (
                (axiosRetry.isNetworkOrIdempotentRequestError && axiosRetry.isNetworkOrIdempotentRequestError(error)) ||
                (error.response && error.response.status >= 500)
            );
        },
    });

    return client;
};