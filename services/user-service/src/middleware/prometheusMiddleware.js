const { httpRequestDuration, httpRequestsTotal } = require('../metrics');

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
            res.statusCode
        ).inc();

        httpRequestDuration.labels(
            req.method,
            path,
            res.statusCode
        ).observe(duration);
    });

    next();
};

module.exports = prometheusMiddleware;