// src/controllers/user.controller.js
const userService = require("../services/user.service");
const { logger } = require("@my-app/common");
/**
 * Create a new user
 */
const createUser = async (req, res, next) => {
	try {
		logger.info("Create user request received");
		const { name, email, password } = req.body;

		const user = await userService.createUser({
			name,
			email,
			password,
		});

		res.status(201).json({
			message: "User created successfully",
			user,
		});

		logger.info({ userId: user.id }, "User created");
	} catch (error) {
		logger.error({ err: error }, "User creation failed");
		next(error);
	}
};

/**
 * Get user by ID
 */
const getUserById = async (req, res, next) => {
	try {
		logger.info(" request received to fetch User by ID");
		const { id } = req.params;

		const user = await userService.getUserById(id);

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		res.status(200).json( user ); 
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
		logger.info("Login request received");
		const { email, password } = req.body;

		const token = await userService.loginUser(email, password);

		res.status(200).json({ token });
		logger.info({ email }, "Login  Successful");
	} catch (error) {
		const attemptedEmail = req.body?.email || "unknown";
		logger.error({ err: error, email: attemptedEmail }, "User Loginfailed");
		next(error);
	}
};

module.exports = {
	createUser,
	getUserById,
	loginUser,
};
