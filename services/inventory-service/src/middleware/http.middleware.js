const metrics = require("../metrics");

module.exports = (req, res, next) => {
	const start = process.hrtime();

	res.on("finish", () => {
		const diff = process.hrtime(start);

		const duration = diff[0] + diff[1] / 1e9;

		const route = req.route?.path || req.path;

		metrics.httpRequestsTotal.inc({
			method: req.method,

			route,

			status: res.statusCode,

			service: process.env.OTEL_SERVICE_NAME,
		});

		metrics.httpRequestDuration.observe(
			{
				method: req.method,

				route,

				status: res.statusCode,

				service: process.env.OTEL_SERVICE_NAME,
			},
			duration,
		);
	});

	next();
};
