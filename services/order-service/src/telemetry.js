const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || "order-service",
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://otel-collector-opentelemetry-collector.observability:4318/v1/traces",
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

// ✅ Fix: Check if it's synchronous (most common in current SDK versions)
try {
  sdk.start();
  console.log("✅ OpenTelemetry initialized");
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