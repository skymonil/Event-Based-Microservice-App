// packages/common/index.js

// Fix: Match the actual file locations in your packages/common/src/ folder
const { logger } = require('./src/logger'); // Remove 'utils/' if it's just in src
const { AppError } = require("./src/appError"); // Adjust path if needed

const authenticate = require('./src/auth.middleware');
const errorHandler = require('./src/error.middleware');
const prometheusMiddleware = require('./src/prometheusMiddleware'); 

const { initTelemetry } = require('./src/telemetry');

module.exports = {
  initTelemetry,
  logger,
  AppError,
  authMiddleware: authenticate,
  errorMiddleware: errorHandler,
  prometheusMiddleware
};