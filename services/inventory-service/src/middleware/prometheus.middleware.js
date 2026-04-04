const metrics = require("../metrics");

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "inventory-service";

module.exports = (req, res, next) => {
	// 1. Use BigInt for cleaner high-precision timing
	const start = process.hrtime.bigint();

	res.on("finish", () => {
		// 2. Calculate duration in seconds
		const end = process.hrtime.bigint();
		const duration = Number(end - start) / 1e9;

		// 3. Route Normalization
		let route = "unknown";
		if (req.route?.path) {
			route = (req.baseUrl || "") + req.route.path;
		} else if (req.baseUrl) {
			route = req.baseUrl;
		}

		// 4. FIX: Correct exclusion check
		// Wrap the recording in an IF block rather than just returning
		const isInternal =
			route === "/health" ||
			route === "/metrics" ||
			req.path === "/health" ||
			req.path === "/metrics";

		if (!isInternal) {
			const labels = {
				method: req.method,
				route,
				status: res.statusCode,
				service: SERVICE_NAME,
			};

			// Record Rate and Errors (Total Requests)
			metrics.httpRequestsTotal.inc(labels);

			// Record Duration (Latency)
			metrics.httpRequestDuration.observe(labels, duration);
		}
	});

	next();
};
