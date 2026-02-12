const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");

// --- 1. NEW IMPORTS FOR METRICS ---
const { OTLPMetricExporter } = require("@opentelemetry/exporter-metrics-otlp-http");
const { PeriodicExportingMetricReader } = require("@opentelemetry/sdk-metrics");

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || "order-service",
  
  // --- TRACES ---
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || "http://otel-collector-opentelemetry-collector.observability:4318/v1/traces",
  }),

  // --- 2. ADD METRICS CONFIGURATION HERE ---
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      // Note: The URL is different! It ends in /v1/metrics
      url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || "http://otel-collector-opentelemetry-collector.observability:4318/v1/metrics", 
    }),
    exportIntervalMillis: 60000, // Optional: Send metrics every 60 seconds
  }),

  instrumentations: [getNodeAutoInstrumentations()],
});

try {
  sdk.start();
  console.log("✅ OpenTelemetry initialized with Tracing AND Metrics");
} catch (err) {
  console.error("❌ OTel initialization failed", err);
}

// Graceful Shutdown
const shutDown = async () => {
  try {
    await sdk.shutdown();
    console.log("Telemetry terminated");
    process.exit(0);
  } catch (err) {
    console.error("Error terminating telemetry", err);
    process.exit(1);
  }
};

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);