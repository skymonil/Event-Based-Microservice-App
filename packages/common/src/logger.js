const pino = require("pino");
const { context, trace } = require("@opentelemetry/api");

const isDev = process.env.NODE_ENV !== "production";

/**
 * Extracts OpenTelemetry Trace and Span IDs from the active context.
 * This allows us to correlate logs with traces in Jaeger/Grafana.
 */
function getTraceContext() {
    const span = trace.getSpan(context.active());
    if (!span) return {};

    const spanContext = span.spanContext();
    
    // Check if the traceId is valid (not all zeros)
    if (!spanContext.traceId || spanContext.traceId === '00000000000000000000000000000000') {
        return {};
    }

    return {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
    };
}

const logger = pino({
    level: process.env.LOG_LEVEL || "info",

    base: {
        // service name should be provided via ENV in Docker/K8s
        service: process.env.OTEL_SERVICE_NAME || "unnamed-service",
    },

    // mixin() is called on every log line to inject dynamic metadata
    mixin() {
        return getTraceContext();
    },

    transport: isDev
        ? {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    translateTime: "SYS:standard",
                    ignore: "pid,hostname",
                },
          }
        : undefined,
});

module.exports = { logger };