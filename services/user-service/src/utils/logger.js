const pino = require("pino");
const { getRequestId } = require("./request-context");

const isDev = process.env.NODE_ENV !== "production";

const logger = pino({

  level: process.env.LOG_LEVEL || "info",

  base: {
    service: process.env.OTEL_SERVICE_NAME || "user-service"
  },

  mixin() {

    const requestId = getRequestId();

    return requestId
      ? { request_id: requestId }
      : {};

  },

  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname"
        }
      }
    : undefined

});

module.exports = { logger };