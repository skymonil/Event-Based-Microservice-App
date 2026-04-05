This `README.md` provides a clear overview of how your metrics are structured, what each one tracks, and how they integrate into your **Prometheus/Grafana** stack.

---

# Metrics Module (`src/metrics/index.js`)

This module initializes the **Prometheus** client for the service, defining standard and custom metrics to monitor **HTTP performance** and **Kafka consumer reliability**.

## 🚀 Overview

We use `prom-client` to capture and expose metrics. These metrics are categorized into **System**, **HTTP**, and **Kafka** dimensions, allowing for granular observability in **Grafana**.

---

## 📊 Metric Definitions

### 1. Default Metrics

* **Source:** `client.collectDefaultMetrics`
* **Description:** Standard Node.js metrics (CPU usage, Memory heap, Event loop lag, and Garbage collection).
* **Usage:** Used to detect resource leaks or scaling needs.

### 2. HTTP Metrics

| Metric Name | Type | Labels | Description |
| --- | --- | --- | --- |
| `http_request_duration_seconds` | **Histogram** | `method`, `route`, `status` | Tracks the latency of incoming API requests. |

### 3. Kafka Metrics

| Metric Name | Type | Labels | Description |
| --- | --- | --- | --- |
| `kafka_messages_consumed_total` | **Counter** | `topic`, `service` | Running total of messages picked up by the consumer. |
| `kafka_message_retries_total` | **Counter** | `topic`, `service` | Number of times a message was re-published for a retry. |
| `kafka_messages_dlq_total` | **Counter** | `topic`, `service` | Messages that failed after max retries and moved to DLQ. |
| `kafka_consumer_paused` | **Gauge** | `topic`, `service` | `1` if the circuit breaker is open (paused), `0` otherwise. |

---

## 🛠 Usage Example

### In a Kafka Consumer:

```javascript
const { kafkaMessagesConsumed, kafkaDLQ } = require("./metrics");

// Increment total consumed count
kafkaMessagesConsumed.inc({ topic: "order.created", service: "payment-service" });

// Increment DLQ count on final failure
kafkaDLQ.inc({ topic: "order.created", service: "payment-service" });

```

### In an Express Route:

```javascript
const { register } = require("./metrics");

// Expose the /metrics endpoint for Prometheus scraping
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

```

---

## 🔍 Grafana Queries (PromQL)

* **Message Processing Rate:** `rate(kafka_messages_consumed_total[5m])`
* **Failure Percentage:** `(rate(kafka_messages_dlq_total[5m]) / rate(kafka_messages_consumed_total[5m])) * 100`
* **Active Pauses:** `sum(kafka_consumer_paused) by (service)`

**Would you like me to help you set up a `/metrics` route in your Express app to expose this data to Prometheus?**