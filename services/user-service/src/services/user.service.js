// services/user.service.js
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const userQueries = require("../db/queries/user.queries");
const config = require("../config/config");
const {
	businessErrorsTotal,
	usersCreatedTotal,
	loginAttempts,
} = require("../metrics");
const { AppError } = require("@my-app/common");

const trackError = (type) => {
	try {
		if (businessErrorsTotal) {
			// 🟢 SAFE CALL: Use object syntax { type: ... }
			businessErrorsTotal.labels({ type }).inc();
		}
	} catch (e) {
		console.warn("⚠️ Metrics Error (Ignored):", e.message);
	}
};

/**
 * Create a new user
 */
const createUser = async ({ name, email, password }) => {
	// Check if user already exists
	const existingUser = await userQueries.getUserByEmail(email);
	if (existingUser) {
		trackError("user_exists");
		throw new AppError({
            status: 409,
            title: "Conflict",
            detail: `User with email ${email} already exists`,
            type: "/problems/user-already-exists"
        });
    }

	// Hash password
	const passwordHash = await bcrypt.hash(password, 10);

	const user = {
		id: uuidv4(),
		name,
		email,
		password_hash: passwordHash,
	};

	// Save user to DB
	await userQueries.createUser(user);

	usersCreatedTotal.inc();

	// Never return password hash
	return {
		id: user.id,
		name: user.name,
		email: user.email,
	};
};

/**
 * Get user by ID
 */
const getUserById = async (id) => {
	const user = await userQueries.getUserById(id);
	if (!user) {
		trackError("user_does_not_exist");
		throw new AppError(
			404,
			"Not Found",
			"User not found",
			"/problems/user-not-found",
		);
	}

	return {
		id: user.id,
		name: user.name,
		email: user.email,
	};
};

/**
 * Login user and generate JWT
 */
const loginUser = async (email, password) => {
	const user = await userQueries.getUserByEmail(email);
	if (!user) {
		trackError("invalid_login");

		loginAttempts.labels({ status: "failed", reason: "user_not_found" }).inc();

		loginAttempts
			.labels({
				status: "failed",
			})
			.inc();

		throw new AppError({
			type: "/problems/invalid-credentials",
			title: "Unauthorized",
			status: 401,
			detail: "User does not exist",
		});
	}

	const isValid = await bcrypt.compare(password, user.password_hash);
	if (!isValid) {
		trackError("invalid_login");

		loginAttempts
			.labels({
				status: "failed",
				reason: "invalid_password",
			})
			.inc();

		throw new AppError({
			type: "https://api.yourservice.com/errors/auth-failed",
			title: "Unauthorized",
			status: 401,
			detail: "Invalid email or password",
		});
	}

	// Generate JWT
	const token = jwt.sign({ userId: user.id }, config.auth.jwtSecret, {
		expiresIn: config.auth.jwtExpiresIn,
	});

	loginAttempts
		.labels({
			status: "success",
		})
		.inc();

	return token;
};

module.exports = {
	createUser,
	getUserById,
	loginUser,
};
