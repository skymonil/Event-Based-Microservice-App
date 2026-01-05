// src/utils/app-error.js
class AppError extends Error {
  constructor({ title, status, detail, type }) {
    super(detail);
    this.title = title;
    this.status = status;
    this.detail = detail;
    this.type = type;
    this.isOperational = true;
  }
}

// This ensures the stack trace starts from where the error was thrown
    Error.captureStackTrace(this, this.constructor);
module.exports = AppError;
