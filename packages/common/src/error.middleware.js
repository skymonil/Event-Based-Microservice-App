// error.middleware.js
const { trace, context } = require("@opentelemetry/api");
const { logger } = require("./logger");

const errorHandler = (err, req, res, _next) => {
    // 1. Extract OpenTelemetry Trace ID for correlation
    const span = trace.getSpan(context.active());
    const spanContext = span ? span.spanContext() : null;
    const traceId = spanContext?.traceId && spanContext.traceId !== '00000000000000000000000000000000' 
        ? spanContext.traceId 
        : null;

    // 2. Log based on severity
    if (err.isOperational && err.status < 500) {
        logger.warn({ 
            status: err.status, 
            message: err.message, 
            path: req.originalUrl,
            trace_id: traceId // Correlate the log with the trace
        }, "Operational Error");
    } else {
        logger.error(err, "Unexpected Server Error");
    }

    // 3. Handle Known Operational Errors (AppError)
    if (err.isOperational) {
        return res.status(err.status).json({
            type: err.type || "https://api.myapp.com/probs/business-rule-violation",
            title: err.title || "Business Rule Violation",
            status: err.status,
            detail: err.detail || err.message,
            instance: req.originalUrl,
            correlation_id: traceId, // Consistent field name for the frontend
        });
    }

    // 4. Fallback for Programmer Errors / Bugs
    return res.status(500).json({
        type: "https://api.myapp.com/probs/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred. Please provide the correlation ID to support.",
        instance: req.originalUrl,
        correlation_id: traceId,
    });
};

module.exports = errorHandler;