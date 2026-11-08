"use strict";

/**
 * Reads and validates the configuration from environment variables.
 * Nothing secret lives in the source code: see .env.example.
 */

const crypto = require("node:crypto");

function toBool(value, fallback = false) {
    if (value === undefined || value === "") return fallback;
    return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function toInt(value, fallback) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

function loadConfig(env = process.env) {
    const nodeEnv = env.NODE_ENV || "production";
    const isProduction = nodeEnv === "production";
    const isDevelopment = nodeEnv === "development";

    let jwtSecret = env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
        if (isProduction) {
            throw new Error("JWT_SECRET must be set to a random string of at least 32 characters.");
        }
        // Development and tests only: a throwaway secret per process.
        jwtSecret = crypto.randomBytes(32).toString("hex");
    }

    const allowedOrigins = (env.ALLOWED_ORIGIN || "")
        .split(",")
        .map((o) => o.trim().replace(/\/$/, ""))
        .filter(Boolean);

    const smtpUser = env.SMTP_USER || "";
    const smtpPassword = env.SMTP_PASSWORD || "";

    return {
        nodeEnv,
        isProduction,
        isDevelopment,
        port: toInt(env.PORT, 3000),
        trustProxy: toInt(env.TRUST_PROXY, isProduction ? 1 : 0),
        allowedOrigins,
        jwtSecret,
        cookieSecure: toBool(env.COOKIE_SECURE, isProduction),
        sessionHours: toInt(env.SESSION_HOURS, 8),
        db: {
            host: env.DB_HOST || "localhost",
            port: toInt(env.DB_PORT, 3306),
            user: env.DB_USER || "root",
            password: env.DB_PASSWORD || "",
            database: env.DB_NAME || "industriel_minier",
            ssl: toBool(env.DB_SSL, false),
        },
        smtp: {
            host: env.SMTP_HOST || "",
            port: toInt(env.SMTP_PORT, 587),
            user: smtpUser,
            password: smtpPassword,
            from: env.SMTP_FROM || smtpUser,
            enabled: Boolean(smtpUser && smtpPassword && env.SMTP_HOST),
        },
        demo: {
            enabled: toBool(env.DEMO_MODE, false),
            email: (env.DEMO_EMAIL || "demo@projet-im.app").toLowerCase(),
            password: env.DEMO_PASSWORD || "Demo-2026-IM",
            resetHours: toInt(env.DEMO_RESET_HOURS, 24),
        },
        rateLimits: {
            login: { windowMs: 15 * 60 * 1000, limit: 10 },
            signup: { windowMs: 60 * 60 * 1000, limit: 5 },
            verify: { windowMs: 15 * 60 * 1000, limit: 10 },
            resend: { windowMs: 15 * 60 * 1000, limit: 3 },
        },
    };
}

module.exports = { loadConfig };
