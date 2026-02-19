const pino = require('pino');

// Check if we are in production
const isProduction = process.env.NODE_ENV === 'production';

const logger = pino(
  isProduction
    ? {} // 🟢 PRODUCTION: Use fast, raw structured JSON
    : {
        // 🟡 LOCAL DEV: Use pino-pretty for human-readable terminal output
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        },
      }
);

module.exports = { logger };