const { AsyncLocalStorage } = require("node:async_hooks");

const asyncLocalStorage = new AsyncLocalStorage();

const setRequestContext = (requestId, callback) => {
	asyncLocalStorage.run({ requestId }, callback);
};

const getRequestId = () => {
	const store = asyncLocalStorage.getStore();

	return store?.requestId;
};

module.exports = {
	setRequestContext,
	getRequestId,
};
