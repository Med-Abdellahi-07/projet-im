"use strict";

const rateLimit = require("express-rate-limit");

/** Builds a limiter from { windowMs, limit }; answers 429 with a JSON message. */
function limiter({ windowMs, limit }) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: { message: "Trop de tentatives. Réessayez plus tard." },
    });
}

module.exports = { limiter };
