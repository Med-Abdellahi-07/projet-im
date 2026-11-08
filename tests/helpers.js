"use strict";

const request = require("supertest");
const { loadConfig } = require("../server/config");
const { createPool } = require("../server/db");
const { createApp } = require("../server/app");
const { migrate } = require("../server/migrate");

/**
 * Tests run against a real MySQL-compatible database (MySQL 8 in CI).
 * Connection settings come from DB_* variables; the default database name
 * is a dedicated test database that is emptied before every test.
 */
function testEnv(overrides = {}) {
    return {
        NODE_ENV: "test",
        DB_HOST: process.env.DB_HOST || "127.0.0.1",
        DB_PORT: process.env.DB_PORT || "3306",
        DB_USER: process.env.DB_USER || "root",
        DB_PASSWORD: process.env.DB_PASSWORD || "",
        DB_NAME: process.env.DB_NAME || "industriel_minier_test",
        ...overrides,
    };
}

/** A mailer that records codes instead of sending them. */
function fakeMailer() {
    const sent = [];
    return {
        enabled: true,
        sent,
        async sendVerificationCode(email, code) {
            sent.push({ email, code });
        },
        lastCode(email) {
            const found = [...sent].reverse().find((m) => m.email === email);
            return found ? found.code : undefined;
        },
    };
}

async function setup({ env = {}, mailer = fakeMailer(), rateLimits } = {}) {
    const config = loadConfig(testEnv(env));
    // Generous limits by default so unrelated tests never hit them.
    config.rateLimits = rateLimits || {
        login: { windowMs: 60000, limit: 1000 },
        signup: { windowMs: 60000, limit: 1000 },
        verify: { windowMs: 60000, limit: 1000 },
        resend: { windowMs: 60000, limit: 1000 },
    };
    await migrate(config.db);
    const pool = createPool(config.db);
    const app = createApp({ pool, config, mailer });
    return { app, pool, config, mailer };
}

async function clearDatabase(pool) {
    for (const table of ["intervention_panne", "interventions", "pannes", "equipements", "utilisateurs"]) {
        await pool.query(`DELETE FROM ${table}`);
    }
}

/** Creates a verified account directly in the database and returns a logged-in agent. */
async function loggedInAgent(ctx, email = "tech@example.com", password = "Password-123") {
    const bcrypt = require("bcryptjs");
    const hash = await bcrypt.hash(password, 4);
    await ctx.pool.query("INSERT INTO utilisateurs (email, mot_de_passe_hash, verifie) VALUES (?, ?, 1)", [
        email,
        hash,
    ]);
    const agent = request.agent(ctx.app);
    const res = await agent.post("/api/auth/connexion").send({ email, mot_de_passe: password });
    if (res.status !== 200) throw new Error(`login failed in test setup: ${res.status}`);
    return agent;
}

module.exports = {
    request,
    setup,
    clearDatabase,
    loggedInAgent,
    fakeMailer,
    testEnv,
};
