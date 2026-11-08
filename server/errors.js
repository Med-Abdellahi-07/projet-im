"use strict";

class HttpError extends Error {
    constructor(status, message, extra = {}) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}

class ValidationError extends HttpError {
    constructor(message, field) {
        super(400, message, field ? { champ: field } : {});
    }
}

module.exports = { HttpError, ValidationError };
