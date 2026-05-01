// tests/common/httpClient.js
import axios from "axios";
import axiosRetry from "axios-retry";
// Ensure you add the .js extension here too!
import config from "./config.js"; 

// 🟢 Use 'export' keyword directly
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

    // Handle the axiosRetry default export vs named export quirk
    const retry = axiosRetry.default || axiosRetry;

    retry(client, {
        retries: 3,
        retryDelay: axiosRetry.exponentialDelay,
        retryCondition: (error) => {
            return (
                axiosRetry.isNetworkOrIdempotentRequestError(error) ||
                (error.response && error.response.status >= 500)
            );
        },
    });

    return client;
};