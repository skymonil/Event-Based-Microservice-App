const { logger } = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  logger.error(err);

  // RFC 7807 compliant operational errors
  if (err.isOperational) {
    return res.status(err.status).json({
      type: err.type,
      title: err.title,
      status: err.status,
      detail: err.detail,
      instance: req.originalUrl
    });
  }

  // Fallback – unknown / programming errors
  return res.status(500).json({
    type: "https://order-service/problems/internal-server-error",
    title: "Internal Server Error",
    status: 500,
    detail: "An unexpected error occurred",
    instance: req.originalUrl
  });
};

module.exports = errorHandler;
