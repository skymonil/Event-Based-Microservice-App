// src/utils/app-error.js

class AppError extends Error {
  constructor({ title, status, detail, type }) {
    super(detail);
    this.title = title || "Application Error";
    this.status = status || 500;
    this.detail = detail;
    this.type = type || "about:blank";
    this.isOperational = true; // Trusted error (not a crash)
  }
}

// 🟢 NEW: Non-Retryable Logic Errors
// Maps to HTTP 400/409/422
class BusinessError extends AppError {
  constructor(detail) {
    super({
      title: "Business Logic Violation",
      status: 400, // 4xx = Do Not Retry in Kafka
      detail,
      type: "business-error"
    });
  }
}

// 🔴 NEW: Retryable Infrastructure Errors
// Maps to HTTP 500/503
class InfraError extends AppError {
  constructor(detail) {
    super({
      title: "Infrastructure Failure",
      status: 503, // 5xx = Retry in Kafka
      detail,
      type: "infra-error"
    });
  }
}

module.exports = { AppError, BusinessError, InfraError };