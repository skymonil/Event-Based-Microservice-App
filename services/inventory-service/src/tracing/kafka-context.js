const {context, propagation, ROOT_CONTEXT} = require('@opentelemetry/api');

function normalizeKafkaHeaders(headers) {
    const normalized = {};
    for (const key of Object.keys(headers)) {
        const value = headers[key];
        if(value == null) continue;
        normalized[key] = Buffer.isBuffer(value) ? value.toString() : String(value);
    }
    return normalized;
}

const extractKafkaContext = (message) => {
    const normalizedHeaders = normalizeKafkaHeaders(message.headers || {});
    return propagation.extract(ROOT_CONTEXT, normalizedHeaders);
}

module.exports = {
    extractKafkaContext
};