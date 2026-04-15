const jwt = require("jsonwebtoken");
const { AppError } = require("./app-error");

const authenticate = (req, res, next) => {

    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {

        return next(new AppError({
            status: 401,
            title: "Unauthorized",
            detail: "Authorization token missing or malformed",
            type: "/problems/missing-token"
        }));

    }

    const token = authHeader.split(" ")[1];

    const secret = process.env.JWT_SECRET;

    if (!secret) {

        return next(
            new Error("JWT_SECRET not configured")
        );

    }

    try {

        const decoded = jwt.verify(token, secret);

        req.user = {
            userId: decoded.userId
        };

        next();

    } catch (error) {

        const detail =
            error.name === "TokenExpiredError"
                ? "Session expired"
                : "Invalid token";

        return next(new AppError({
            status: 401,
            title: "Unauthorized",
            detail,
            type: "/problems/invalid-token"
        }));

    }
};

module.exports = authenticate;