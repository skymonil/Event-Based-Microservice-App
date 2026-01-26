const { NodeSDK } = require("@opentelemetry/sdk-node");
const {
  getNodeAutoInstrumentations
} = require("@opentelemetry/auto-instrumentations-node");
const {
  OTLPTraceExporter
} = require("@opentelemetry/exporter-trace-otlp-http");

const sdk = new NodeSDK({
    serviceName: "payment-service",
  traceExporter: new OTLPTraceExporter({
    serviceName: "payment-service",
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  }),
  instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start()
  