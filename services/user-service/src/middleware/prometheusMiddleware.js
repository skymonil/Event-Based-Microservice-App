// middleware/prometheusMiddleware.js
const { httpRequestDuration, httpRequestsTotal } = require('../metrics');
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "user-service";
const prometheusMiddleware = (req, res, next) => {
    const start = process.hrtime();

    res.on("finish", () => {
        // ✅ FIX: Capture the result of hrtime in the 'diff' variable
        const diff = process.hrtime(start); 
        const duration = diff[0] + diff[1] / 1e9;

        // Use optional chaining for route path
        const path = req.route?.path || req.path;

        httpRequestsTotal.labels(
            req.method,
            path,
            res.statusCode,
            SERVICE_NAME
        ).inc();

        httpRequestDuration.labels(
            req.method,
            path,
            res.statusCode,
            SERVICE_NAME
        ).observe(duration);
    });

    next();
};

module.exports = prometheusMiddleware;