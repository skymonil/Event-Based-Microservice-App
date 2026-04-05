const jwt = require("jsonwebtoken");
const AppError = require("./app-error");

/**
 * JWT authentication middleware
 * Uses process.env.JWT_SECRET to keep the shared package agnostic
 */
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    // 1. Check for Bearer token
    if (!authHeader?.startsWith("Bearer ")) {
        return next(new AppError(
            401, 
            "Unauthorized", 
            "Authorization token missing or malformed",
            "https://api.myapp.com/probs/missing-token"
        ));
    }

    const token = authHeader.split(" ")[1];
    
    // 2. Secret must be in Env Var so any service can use this middleware
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
        // This is a programmer error (forgot to set ENV), so we don't use AppError
        return next(new Error("JWT_SECRET is not defined in environment variables"));
    }

    try {
        const decoded = jwt.verify(token, secret);
        
        // 3. Attach user to request object
        req.user = { userId: decoded.userId };
        next();
    } catch (error) {
        // 4. Distinguish between expired and invalid for better DX
        const detail = error.name === "TokenExpiredError" 
            ? "Your session has expired. Please log in again." 
            : "The provided token is invalid.";

        next(new AppError(
            401, 
            "Unauthorized", 
            detail,
            "https://api.myapp.com/probs/invalid-token"
        ));
    }
};

module.exports = authenticate;