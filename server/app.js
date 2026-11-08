"use strict";

require("express-async-errors");
const path = require("node:path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { HttpError } = require("./errors");
const { securityHeaders, corsPolicy, sameOriginForWrites } = require("./middleware/security");
const { requireAuth } = require("./middleware/auth");
const { authRoutes } = require("./routes/auth");
const { equipementsRoutes } = require("./routes/equipements");
const { pannesRoutes } = require("./routes/pannes");
const { interventionsRoutes } = require("./routes/interventions");
const { dashboardRoutes } = require("./routes/dashboard");

/**
 * Builds the Express application. Dependencies are injected so tests can
 * use their own database pool, configuration and mailer.
 */
function createApp({ pool, config, mailer }) {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", config.trustProxy);

    app.use(securityHeaders(config));
    app.use(corsPolicy(config));
    app.use(express.json({ limit: "100kb" }));
    app.use(cookieParser());
    app.use("/api", sameOriginForWrites(config));

    // Used by the hosting platform to know the service is up (no database access).
    app.get("/healthz", (req, res) => res.json({ status: "ok" }));

    // Public API: sign-up, verification, login, logout.
    const deps = { pool, config, mailer };
    app.use("/api/auth", authRoutes(deps));

    // Everything else under /api requires a valid session cookie.
    app.use("/api", requireAuth(config));
    app.use("/api/equipements", equipementsRoutes(deps));
    app.use("/api/pannes", pannesRoutes(deps));
    app.use("/api/interventions", interventionsRoutes(deps));
    app.use("/api/dashboard", dashboardRoutes(deps));
    app.use("/api", (req, res) => res.status(404).json({ message: "Route introuvable." }));

    // Frontend (one service for API and pages).
    const publicDir = path.join(__dirname, "..", "public");
    app.get("/", (req, res) => res.redirect("/login.html"));
    app.use(express.static(publicDir, { extensions: ["html"] }));

    app.use(errorHandler(config));
    return app;
}

function errorHandler(config) {
    // eslint-disable-next-line no-unused-vars
    return (error, req, res, next) => {
        if (error instanceof HttpError) {
            return res.status(error.status).json({ message: error.message, ...error.extra });
        }
        if (error.type === "entity.parse.failed") {
            return res.status(400).json({ message: "JSON invalide." });
        }
        if (error.type === "entity.too.large") {
            return res.status(413).json({ message: "Requête trop volumineuse." });
        }
        console.error(error);
        return res.status(500).json({
            message: "Erreur serveur.",
            ...(config.isDevelopment ? { detail: error.message } : {}),
        });
    };
}

module.exports = { createApp };
