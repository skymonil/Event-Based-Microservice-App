const fs = require("fs");
const path = require("path");
const pool = require("./index");

const runMigrations = async () => {
  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir).sort();

  const client = await pool.connect(); // Get a single client for the transaction
  try {
    await client.query('BEGIN');
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      console.log(`Running migration: ${file}`);
      await client.query(sql);
    }
    await client.query('COMMIT');
    console.log("✅ Migrations applied");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("❌ Migration failed, rolled back:", err.message);
    throw err; // Rethrow to stop the service from starting
  } finally {
    client.release();
  }
};
