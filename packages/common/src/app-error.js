class AppError extends Error {
    constructor({status, title, detail, type}) {
        super(detail);
        this.status = status || 500;
        this.title = title || "Internal Server Error";
        this.detail = detail;
        this.type = type || 'about:blank';
        this.isOperational = true; // This is the key for the middleware!
        Error.captureStackTrace(this, this.constructor);
    }
}


module.exports = AppError;