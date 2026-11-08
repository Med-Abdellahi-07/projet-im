"use strict";

const helmet = require("helmet");
const cors = require("cors");

/** helmet with a strict Content-Security-Policy (all scripts and styles come from this origin). */
function securityHeaders(config) {
    return helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                "default-src": ["'self'"],
                "script-src": ["'self'"],
                "style-src": ["'self'"],
                "img-src": ["'self'", "data:"],
                "connect-src": ["'self'"],
                "form-action": ["'self'"],
                "frame-ancestors": ["'none'"],
                "upgrade-insecure-requests": config.isProduction ? [] : null,
            },
        },
        // Avoid forcing HTTPS on localhost during development.
        strictTransportSecurity: config.isProduction,
    });
}

/**
 * CORS: by default nothing cross-origin is allowed (the app serves its own
 * frontend). Only origins listed in ALLOWED_ORIGIN get CORS headers.
 */
function corsPolicy(config) {
    return cors({
        origin(origin, callback) {
            if (!origin) return callback(null, true);
            return callback(null, config.allowedOrigins.includes(origin));
        },
        credentials: true,
    });
}

/**
 * Defense in depth against CSRF on top of SameSite=Strict cookies:
 * a state-changing request that carries an Origin header must come from this
 * app's own origin or from an allowed origin.
 */
function sameOriginForWrites(config) {
    return (req, res, next) => {
        if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
        const origin = req.get("origin");
        if (!origin) return next();
        const own = `${req.protocol}://${req.get("host")}`;
        if (origin === own || config.allowedOrigins.includes(origin)) return next();
        return res.status(403).json({ message: "Origine non autorisée." });
    };
}

module.exports = { securityHeaders, corsPolicy, sameOriginForWrites };
