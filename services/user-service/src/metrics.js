const client = require("prom-client");

const register = new client.Registry();

const SERVICE_NAME = process.env.SERVICE_NAME || "user-service";

/*
================================
Default Runtime Metrics
================================
*/

client.collectDefaultMetrics({
	register,
	prefix: "node_",
});



/*
================================
HTTP (RED metrics)
================================
*/

//Total HTTP Requests
const httpRequestsTotal = new client.Counter({
	name: "http_requests_total",
	help: "Ttoal number of HTTP requests",
	labelNames: ["method", "route", "status", "service"],
	registers: [register],
});

// Request latency
const httpRequestDuration = new client.Histogram({
	name: "http_request_duration_seconds",
	help: "Request duration in seconds",
	labelNames: ["method", "route", "status", "service"],
	buckets: [0.1, 0.3, 0.5, 1.3, 5],
	registers: [register],
});


/*
================================
user domain metrics
================================
*/

const businessErrorsTotal = new client.Counter({
    name: "business_errors_total", // 🚨 FIXED: Lowercase for Prometheus standards
    help: "Total business logic errors",
    labelNames: ["type"],
    registers: [register], // 🚨 FIXED
});

const usersCreatedTotal = new client.Counter({
    name: "users_created_total",
    help: "Total users created",
    registers: [register], // 🚨 FIXED
});

const loginAttempts = new client.Counter({
    name: "login_attempts_total",
    help: "Login attempts",
    labelNames: ["status", "reason"], // 🚨 FIXED: Added "reason" to prevent crashes
    registers: [register], // 🚨 FIXED
});


module.exports = {
	register,
	httpRequestsTotal,
	httpRequestDuration,
	usersCreatedTotal,
	loginAttempts,
	businessErrorsTotal,
};
