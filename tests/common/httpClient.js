// tests/common/httpClient.js
import axios from "axios";
import config from "./config.js";
import { wait } from "./waitFor.js"; // 🟢 Re-use your wait utility!

export const createClient = (baseUrl = config.baseUrl) => {
    const client = axios.create({
        baseURL: baseUrl,
        timeout: config.timeouts.http,
        validateStatus: () => true, // Resolve all HTTP statuses
        headers: {
            "Content-Type": "application/json",
            "x-synthetic-test": "true",
        },
    });

    // 🟢 Native Retry Logic using Axios Interceptors
    client.interceptors.response.use(
        (response) => {
            // If it's a 5xx error, we manually reject to trigger the retry block below
            if (response.status >= 500) {
                return Promise.reject({ config: response.config, response, isServerError: true });
            }
            return response;
        },
        async (error) => {
            const reqConfig = error.config;
            
            // If we don't have config, or we've retried 3 times, give up
            if (!reqConfig) return Promise.reject(error);
            reqConfig.retryCount = reqConfig.retryCount || 0;
            if (reqConfig.retryCount >= 3) return Promise.resolve(error.response || error);

            // Check if it's a network error (no response) OR a 5xx error
            if (!error.response || error.isServerError) {
                reqConfig.retryCount += 1;
                const delay = Math.pow(2, reqConfig.retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s
                console.log(`⚠️ Request failed. Retrying in ${delay}ms... (Attempt ${reqConfig.retryCount})`);
                
                await wait(delay);
                return client(reqConfig); // Retry the request
            }

            return Promise.resolve(error.response);
        }
    );

    return client;
};