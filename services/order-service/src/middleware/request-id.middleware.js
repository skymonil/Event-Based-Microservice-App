// middleware/request-id.middleware.js
const { v4: uuidv4 } = require("uuid");

const { setRequestContext } = require("../utils/request-context");

const requestIdMiddleware = (req, res, next) => {
	const requestId = req.headers["x-request-id"] || uuidv4();

	req.requestId = requestId;

	res.setHeader("X-Request-Id", requestId);

	setRequestContext(requestId, next);
};

module.exports = requestIdMiddleware;
