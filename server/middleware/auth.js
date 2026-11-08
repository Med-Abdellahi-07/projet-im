"use strict";

const jwt = require("jsonwebtoken");

const COOKIE_NAME = "im_session";

function cookieOptions(config) {
    return {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: "strict",
        path: "/",
    };
}

function issueSession(res, config, user) {
    const token = jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
        algorithm: "HS256",
        expiresIn: `${config.sessionHours}h`,
    });
    res.cookie(COOKIE_NAME, token, {
        ...cookieOptions(config),
        maxAge: config.sessionHours * 60 * 60 * 1000,
    });
}

function clearSession(res, config) {
    res.clearCookie(COOKIE_NAME, cookieOptions(config));
}

/** Rejects the request with 401 unless it carries a valid session cookie. */
function requireAuth(config) {
    return (req, res, next) => {
        const token = req.cookies && req.cookies[COOKIE_NAME];
        if (!token) return res.status(401).json({ message: "Authentification requise." });
        try {
            const payload = jwt.verify(token, config.jwtSecret, {
                algorithms: ["HS256"],
            });
            req.user = { id: payload.sub, email: payload.email };
            return next();
        } catch {
            clearSession(res, config);
            return res.status(401).json({ message: "Session expirée. Reconnectez-vous." });
        }
    };
}

module.exports = { COOKIE_NAME, issueSession, clearSession, requireAuth };
