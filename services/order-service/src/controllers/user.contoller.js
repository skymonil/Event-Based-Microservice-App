// src/controllers/user.controller.js
const userService = require("../services/user.service");
const logger = require("../utils/logger");
const { getRequestLogger } = require("../utils/logger");
/**
 * Create a new user
 */
const createUser = async (req, res, next) => {
  const logger = getRequestLogger(req.requestId);
  try {
    logger.info("Create user request received");
    const { name, email, password } = req.body;

    const user = await userService.createUser({
      name,
      email,
      password
    });
     logger.info({ userId: user.id }, "User created");
    res.status(201).json({
      message: "User created successfully",
      user
    });
  } catch (error) {
    logger.error(error);
    next(error);
  }
};

/**
 * Get user by ID
 */
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await userService.getUserById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    logger.error(error);
    next(error);
  }
};

/**
 * Login user
 */
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const token = await userService.loginUser(email, password);

    res.status(200).json({ token });
  } catch (error) {
    logger.error(error);
    next(error);
  }
};

module.exports = {
  createUser,
  getUserById,
  loginUser
};
