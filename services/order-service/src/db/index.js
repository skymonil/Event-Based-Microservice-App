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
  // Log the error so you can see it in Datadog/CloudWatch
  logger.error({ err }, "Unexpected PostgreSQL idle client error");
  
  // Do NOT process.exit(1) here. 
  // The 'pg' pool will automatically attempt to create new clients 
  // when the next query comes in.
});

/**
 * Run a SQL query
 */
const query = (text, params) => {
  return pool.query(text, params);
};

/**
 * ADDED: Get a client from the pool for Transactions
 */
const connect = () => {
  return pool.connect();
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
  close,
  connect
};
