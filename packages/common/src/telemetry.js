// packages/common/src/telemetry.js
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const { OTLPMetricExporter } = require("@opentelemetry/exporter-metrics-otlp-http");
const { PeriodicExportingMetricReader } = require("@opentelemetry/sdk-metrics");
const { resourceFromAttributes } = require("@opentelemetry/resources");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");

const initTelemetry = (serviceName) => {
    // 1. Prioritize explicitly passed name, fallback to ENV, throw if missing
    const finalServiceName = serviceName || process.env.OTEL_SERVICE_NAME;
    if (!finalServiceName) {
        throw new Error("OTEL_SERVICE_NAME is required to initialize telemetry.");
    }

    const COLLECTOR_URL =
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
        "http://otel-collector-opentelemetry-collector.observability:4318";

    const sdk = new NodeSDK({
        resource: resourceFromAttributes({
            [SemanticResourceAttributes.SERVICE_NAME]: finalServiceName,
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
        console.log(`✅ OTel initialized for ${finalServiceName}`);
    } catch (err) {
        console.error(`OTel init failed for ${finalServiceName}`, err);
    }

    const shutDown = async () => {
        await sdk.shutdown();
        process.exit(0);
    };

    process.on("SIGTERM", shutDown);
    process.on("SIGINT", shutDown);
    
    return sdk;
};

module.exports = { initTelemetry };