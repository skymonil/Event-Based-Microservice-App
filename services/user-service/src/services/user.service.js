const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const userQueries = require("../db/queries/user.queries");
const config = require("../config/config");
const {businessErrorsTotal} = require('../metrics')

/**
 * Create a new user
 */
const createUser = async ({ name, email, password }) => {
  // Check if user already exists
  const existingUser = await userQueries.getUserByEmail(email);
  if (existingUser) {
    businessErrorsTotal.labels('user_exists').inc();
    throw new Error("User already exists");
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  const user = {
    id: uuidv4(),
    name,
    email,
    password_hash: passwordHash
  };

  // Save user to DB
  await userQueries.createUser(user);

  // Never return password hash
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
};

/**
 * Get user by ID
 */
const getUserById = async (id) => {
  const user = await userQueries.getUserById(id);
  if (!user) {
     businessErrorsTotal.labels('user_does_not_exist').inc()
    throw new Error("User Not found")
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
};

/**
 * Login user and generate JWT
 */
const loginUser = async (email, password) => {
  const user = await userQueries.getUserByEmail(email);
  if (!user) {
     businessErrorsTotal.labels('invalid_login').inc();
    throw new Error("Invalid email or password");
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    businessErrorsTotal.labels('invalid_login').inc();
    throw new Error("Invalid email or password");
  }

  // Generate JWT
  const token = jwt.sign(
    { userId: user.id },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn }
  );

  return token;
};

module.exports = {
  createUser,
  getUserById,
  loginUser
};
