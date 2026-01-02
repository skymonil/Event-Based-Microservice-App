const db = require("../index");

/**
 * Get user by email
 */
const getUserByEmail = async (email) => {
  const result = await db.query(
    `SELECT id, name, email, password_hash
     FROM users
     WHERE email = $1`,
    [email]
  );

  return result.rows[0] || null;
};

/**
 * Get user by ID
 */
const getUserById = async (id) => {
  const result = await db.query(
    `SELECT id, name, email
     FROM users
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
};

/**
 * Create a new user
 */
const createUser = async (user) => {
  const { id, name, email, password_hash } = user;

  await db.query(
    `INSERT INTO users (id, name, email, password_hash)
     VALUES ($1, $2, $3, $4)`,
    [id, name, email, password_hash]
  );
};

module.exports = {
  getUserByEmail,
  getUserById,
  createUser
};
