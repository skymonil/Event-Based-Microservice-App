const jwt = require("jsonwebtoken");
const config = require("../config/config");
const AppError = require('../utils/app-error');

/**
 * JWT authentication middleware
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 1. Check for header existence
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(
      new AppError({
        type: "https://payment-service/problems/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Missing or invalid Authorization header"
      })
    );
  } // <--- This was originally closing the whole function!

  // 2. Extract the token
  const token = authHeader.split(" ")[1];

  // 3. Verify the token
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret);

    // Attach user data to the request object
    req.user = {
      userId: payload.userId,
      role: payload.role
    };

    next();
  } catch (error) {
    return next(
      new AppError({
        type: "https://payment-service/problems/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Invalid or expired token"
      })
    );
  }
}; // <--- The function should close here.

module.exports = authenticate;