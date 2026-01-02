const logger = require("../utils/logger");

/**
 * Central error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  logger.error(err);

  // Default error values
  let statusCode = 500;
  let message = "Internal Server Error";

  // Custom application errors
  if (err.message === "User already exists") {
    statusCode = 409;
    message = err.message;
  }

  if (err.message === "Invalid email or password") {
    statusCode = 401;
    message = err.message;
  }

  res.status(statusCode).json({
    error: message
  });
};

module.exports = errorHandler;
