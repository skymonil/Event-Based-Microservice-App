const { NodeSDK } = require("@opentelemetry/sdk-node");

const {
	getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");

const {
	OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");

const {
	OTLPMetricExporter,
} = require("@opentelemetry/exporter-metrics-otlp-http");

const { PeriodicExportingMetricReader } = require("@opentelemetry/sdk-metrics");

const { resourceFromAttributes } = require("@opentelemetry/resources");

const {
	SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions");

const COLLECTOR_URL =
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
	"http://otel-collector-opentelemetry-collector.observability:4318";

const sdk = new NodeSDK({
	resource: resourceFromAttributes({
		[SemanticResourceAttributes.SERVICE_NAME]:
			process.env.OTEL_SERVICE_NAME || "inventory-service",
	}),

	traceExporter: new OTLPTraceExporter({
		url: `${COLLECTOR_URL}/v1/traces`,
	}),

	metricReader: new PeriodicExportingMetricReader({
		exporter: new OTLPMetricExporter({
			url: `${COLLECTOR_URL}/v1/metrics`,
		}),

		exportIntervalMillis: 60000,
	}),

	instrumentations: [getNodeAutoInstrumentations()],
});

try {
	sdk.start();

	console.log("✅ OTel initialized");
} catch (err) {
	console.error("OTel init failed", err);
}

const shutDown = async () => {
	await sdk.shutdown();

	process.exit(0);
};

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
