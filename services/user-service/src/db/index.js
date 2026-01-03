const { Pool } = require("pg");
const config = require("../config/config");
const {logger} = require("../utils/logger");

const pool = new Pool({
  connectionString: config.database.url,
  max: 10,                  // max connections
  idleTimeoutMillis: 30000, // close idle clients
  connectionTimeoutMillis: 2000
});

pool.on("connect", () => {
  logger.info("Connected to PostgreSQL");
});

pool.on("error", (err) => {
  logger.error("Unexpected PostgreSQL error", err);
  process.exit(1);
});

/**
 * Run a SQL query
 */
const query = (text, params) => {
  return pool.query(text, params);
};

/**
 * Close DB connections (used in graceful shutdown)
 */
const close = async () => {
  logger.info("Closing PostgreSQL connections...");
  await pool.end();
};

module.exports = {
  query,
  close
};
