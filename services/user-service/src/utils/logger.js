const pino = require("pino");

const baseLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard"
          }
        }
      : undefined
});

/**
 * Create a request-scoped logger
 */
const getRequestLogger = (requestId) => {
  return baseLogger.child({ requestId });
};

module.exports = {
  logger: baseLogger,
  getRequestLogger
};
