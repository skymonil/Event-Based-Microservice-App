const pino = require("pino");
const { context, trace } = require("@opentelemetry/api");

const isDev = process.env.NODE_ENV !== "production";

function getTraceContext() {
    const span = trace.getSpan(context.active());
    if (!span) return {};

    const spanContext = span.spanContext();

    if (!spanContext.traceId ||
        spanContext.traceId === "00000000000000000000000000000000") {
        return {};
    }

    return {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
    };
}

let transport;

if (isDev) {
    try {
        require.resolve("pino-pretty");

        transport = {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "SYS:standard",
                ignore: "pid,hostname",
            },
        };
    } catch {
        // fallback silently if not installed
    }
}

const logger = pino({
    level: process.env.LOG_LEVEL || "info",

    base: {
        service: process.env.OTEL_SERVICE_NAME || "unnamed-service",
    },

    mixin() {
        return getTraceContext();
    },

    transport,
});

module.exports = { logger };