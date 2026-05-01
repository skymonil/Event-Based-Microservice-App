import config from "../common/config.js"; // Note the .js extension


module.exports = {
	displayName: "user-service",
    testEnvironment: "node",
    verbose: true,
    testMatch: ["**/*.smoke.test.js"],
	testTimeout: 30000,
	timeouts: {
		http: 15000,
		async: 20000,
		jest: 30000,
	},
};
