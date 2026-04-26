// src/db/index.js
const { Pool } = require("pg");
const config = require("../config/config");
const { logger } = require("@my-app/common");

const pool = new Pool({
    connectionString: config.database.url,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on("connect", () => {
    logger.info("Connected to PostgreSQL");
});

pool.on("error", (err) => {
    logger.error("Unexpected PostgreSQL error", err);
    process.exit(1);
});

const query = (text, params) => {
    return pool.query(text, params);
};

// 🟢 ADD THIS: Expose the connect method for transactions
const connect = () => {
    return pool.connect();
};

const close = async () => {
    logger.info("Closing PostgreSQL connections...");
    await pool.end();
};

module.exports = {
    query,
    connect, // 🟢 Make sure to export it!
    close,
};