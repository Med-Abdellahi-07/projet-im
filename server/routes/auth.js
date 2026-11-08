"use strict";

const crypto = require("node:crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { HttpError, ValidationError } = require("../errors");
const { normalizeEmail, parsePassword, parseCode } = require("../validation");
const { issueSession, clearSession, requireAuth } = require("../middleware/auth");
const { limiter } = require("../middleware/rateLimit");

const CODE_LIFETIME_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

const GENERIC_SIGNUP = "Si l'adresse est valide, un code de vérification vient d'être envoyé.";
const GENERIC_RESEND =
    "Si un compte en attente existe pour cette adresse, un nouveau code vient d'être envoyé.";
const BAD_CODE = "Code invalide ou expiré. Demandez un nouveau code si nécessaire.";
const BAD_LOGIN = "Email ou mot de passe incorrect.";

// Compared against when the account does not exist, so response time does not reveal it.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

function generateCode() {
    return String(crypto.randomInt(100000, 1000000));
}

function hashCode(code) {
    return crypto.createHash("sha256").update(code).digest("hex");
}

function sameDigest(a, b) {
    const x = Buffer.from(a, "hex");
    const y = Buffer.from(b, "hex");
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function authRoutes({ pool, config, mailer }) {
    const router = express.Router();
    const limits = config.rateLimits;

    /** Stores a fresh code for the account and e-mails it. Returns the clear code. */
    async function issueCode(userId, email) {
        const code = generateCode();
        await pool.query(
            `UPDATE utilisateurs
             SET code_verification = ?, code_expiration = ?, tentatives_code = 0
             WHERE id = ?`,
            [hashCode(code), new Date(Date.now() + CODE_LIFETIME_MS), userId],
        );
        try {
            await mailer.sendVerificationCode(email, code);
        } catch (error) {
            console.error("E-mail could not be sent:", error.message);
        }
        if (!mailer.enabled && config.isDevelopment) {
            console.log(`[development, no SMTP] verification code for ${email}: ${code}`);
        }
        return code;
    }

    /** Without SMTP, only development mode may create accounts. */
    function signupAvailable() {
        return mailer.enabled || config.isDevelopment;
    }

    router.post("/inscription", limiter(limits.signup), async (req, res) => {
        if (!signupAvailable()) {
            throw new HttpError(503, "L'inscription n'est pas disponible sur ce serveur.");
        }
        const email = normalizeEmail(req.body?.email);
        const password = parsePassword(req.body?.mot_de_passe);

        const [rows] = await pool.query("SELECT id, verifie FROM utilisateurs WHERE email = ?", [email]);
        let code;
        if (rows.length === 0) {
            const hash = await bcrypt.hash(password, 10);
            try {
                const [result] = await pool.query(
                    "INSERT INTO utilisateurs (email, mot_de_passe_hash, verifie) VALUES (?, ?, 0)",
                    [email, hash],
                );
                code = await issueCode(result.insertId, email);
            } catch (error) {
                if (error.code !== "ER_DUP_ENTRY") throw error;
            }
        } else if (!rows[0].verifie) {
            // Pending account: send a new code, never replace the password.
            code = await issueCode(rows[0].id, email);
        }
        // Same answer whether or not the address was already registered.
        const answer = { message: GENERIC_SIGNUP };
        if (config.isDevelopment && !mailer.enabled && code) answer.codeDeTest = code;
        res.status(201).json(answer);
    });

    router.post("/verification", limiter(limits.verify), async (req, res) => {
        const email = normalizeEmail(req.body?.email);
        const code = parseCode(req.body?.code);

        const [rows] = await pool.query("SELECT * FROM utilisateurs WHERE email = ?", [email]);
        const user = rows[0];
        if (!user || user.verifie || !user.code_verification) throw new ValidationError(BAD_CODE);

        if (user.tentatives_code >= MAX_CODE_ATTEMPTS || new Date(user.code_expiration) < new Date()) {
            await pool.query("UPDATE utilisateurs SET code_verification = NULL WHERE id = ?", [user.id]);
            throw new ValidationError(BAD_CODE);
        }

        if (!sameDigest(hashCode(code), user.code_verification)) {
            const attempts = user.tentatives_code + 1;
            // After the 5th wrong attempt the code is cancelled: a new one is required.
            await pool.query(
                `UPDATE utilisateurs SET tentatives_code = ?,
                 code_verification = IF(? >= ?, NULL, code_verification) WHERE id = ?`,
                [attempts, attempts, MAX_CODE_ATTEMPTS, user.id],
            );
            throw new ValidationError(BAD_CODE);
        }

        await pool.query(
            "UPDATE utilisateurs SET verifie = 1, code_verification = NULL, tentatives_code = 0 WHERE id = ?",
            [user.id],
        );
        res.json({
            message: "Compte vérifié avec succès. Vous pouvez vous connecter.",
        });
    });

    router.post("/renvoyer-code", limiter(limits.resend), async (req, res) => {
        if (!signupAvailable()) {
            throw new HttpError(503, "L'envoi de code n'est pas disponible sur ce serveur.");
        }
        const email = normalizeEmail(req.body?.email);
        const [rows] = await pool.query("SELECT * FROM utilisateurs WHERE email = ?", [email]);
        const user = rows[0];

        let code;
        if (user && !user.verifie) {
            const sentAt = user.code_expiration
                ? new Date(user.code_expiration).getTime() - CODE_LIFETIME_MS
                : 0;
            if (Date.now() - sentAt >= RESEND_COOLDOWN_MS) code = await issueCode(user.id, email);
        }
        const answer = { message: GENERIC_RESEND };
        if (config.isDevelopment && !mailer.enabled && code) answer.codeDeTest = code;
        res.json(answer);
    });

    router.post("/connexion", limiter(limits.login), async (req, res) => {
        const email = normalizeEmail(req.body?.email);
        const password = typeof req.body?.mot_de_passe === "string" ? req.body.mot_de_passe : "";

        const [rows] = await pool.query("SELECT * FROM utilisateurs WHERE email = ?", [email]);
        const user = rows[0];
        const valid = await bcrypt.compare(password, user ? user.mot_de_passe_hash : DUMMY_HASH);
        if (!user || !valid) throw new HttpError(401, BAD_LOGIN);

        if (!user.verifie) {
            return res.status(403).json({
                message: "Ce compte n'est pas encore vérifié.",
                nonVerifie: true,
            });
        }
        issueSession(res, config, user);
        return res.json({
            message: "Connexion réussie.",
            utilisateur: { id: user.id, email: user.email },
        });
    });

    router.post("/deconnexion", (req, res) => {
        clearSession(res, config);
        res.json({ message: "Déconnexion réussie." });
    });

    /** Lets the frontend ask the server who is logged in (the server decides, not localStorage). */
    router.get("/moi", requireAuth(config), (req, res) => {
        res.json({ utilisateur: req.user });
    });

    return router;
}

module.exports = { authRoutes, hashCode };
