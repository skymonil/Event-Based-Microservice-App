const client  = require('prom-client');

// Collect Default Node.js Metrics (CPU, memeory, event loop etc)
client.collectDefaultMetrics()

//Custom Metrics

//Total HTTP Requests
const httpRequestsTotal = new client.Counter({
    name: "http_requests_total",
    help: "Ttoal number of HTTP requests",
    labelNames: ["method", "route", "status"]
})

// Request latency
const httpRequestDuration = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "Request duration in seconds",
    labelNames: ["method", "route", "status"],
    buckets: [0.1, 0.3, 0.5, 1.3, 5]
})

//Business Errors (like login Failed)
const businessErrorsTotal = new client.Counter({
    name: "Business_errors_total",
    help: "Total business logic errors",
    labelNames: ["type"]
})

module.exports = {
    client,
    httpRequestDuration,
    httpRequestsTotal,
    businessErrorsTotal
}