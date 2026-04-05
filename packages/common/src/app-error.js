class AppError extends Error {
    constructor(status, title, detail, type) {
        super(detail);
        this.status = status;
        this.title = title;
        this.detail = detail;
        this.type = type;
        this.isOperational = true; // This is the key for the middleware!
        Error.captureStackTrace(this, this.constructor);
    }
}