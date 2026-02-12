const { logger } = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  // 1. Default values if not an AppError
  const status = err.status || 500;
  const title = err.title || "Internal Server Error";
  const detail = err.detail || err.message || "An unexpected error occurred";
  const type = err.type || "about:blank"; // RFC 7807 default for unknown types

  // 2. Log appropriately
  if (status >= 500) {
    logger.error(err, "Unexpected Server Error");
  } else {
    logger.warn({ err: err.message, status }, "Operational Error");
  }

  // 3. Send RFC 7807 Response
  res.status(status).json({
    type,
    title,
    status,
    detail,
    instance: req.originalUrl // Useful for debugging (tells WHICH endpoint failed)
  });
};

module.exports = errorHandler;