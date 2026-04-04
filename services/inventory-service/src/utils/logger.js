const pino = require("pino");
const { context, trace } = require("@opentelemetry/api");
const { getRequestId } = require("./request-context");

const isDev = process.env.NODE_ENV !== "production";

function getTraceContext() {
	const span = trace.getSpan(context.active());

	if (!span) return {};

	const spanContext = span.spanContext();

	return {
		trace_id: spanContext.traceId,

		span_id: spanContext.spanId,

		trace_flags: spanContext.traceFlags,
	};
}

const logger = pino({
	level: process.env.LOG_LEVEL || "info",

	base: {
		service: process.env.OTEL_SERVICE_NAME || "order-service",
	},

	mixin() {
		const requestId = getRequestId();

		return {
			...(requestId ? { request_id: requestId } : {}),

			...getTraceContext(),
		};
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
