"use strict";

const { ValidationError } = require("./errors");

const ETATS = ["En service", "En panne", "En maintenance"];
const PRIORITES = ["Basse", "Moyenne", "Haute"];
const STATUTS_PANNE = ["Ouverte", "Résolue"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function body(req) {
    if (!isPlainObject(req.body)) throw new ValidationError("Corps de requête invalide.");
    return req.body;
}

/** Positive integer from a number or a numeric string (ids). */
function parseId(value, label = "identifiant") {
    const text = String(value ?? "").trim();
    if (!/^[1-9][0-9]{0,9}$/.test(text)) {
        throw new ValidationError(`Valeur invalide : ${label}.`, label);
    }
    const n = Number(text);
    if (n > 2147483647) throw new ValidationError(`Valeur invalide : ${label}.`, label);
    return n;
}

function parseText(value, { label, min = 0, max, required = false }) {
    if (value === undefined || value === null || value === "") {
        if (required) throw new ValidationError(`${label} est obligatoire.`, label);
        return null;
    }
    if (typeof value !== "string") throw new ValidationError(`${label} est invalide.`, label);
    const text = value.trim();
    if (text.length === 0 && required) throw new ValidationError(`${label} est obligatoire.`, label);
    if (text.length < min) throw new ValidationError(`${label} est trop court.`, label);
    if (text.length > max) {
        throw new ValidationError(`${label} est trop long (${max} caractères maximum).`, label);
    }
    return text === "" ? null : text;
}

function parseEnum(value, allowed, { label, fallback } = {}) {
    if (value === undefined || value === null || value === "") {
        if (fallback !== undefined) return fallback;
        throw new ValidationError(`${label} est obligatoire.`, label);
    }
    if (!allowed.includes(value)) throw new ValidationError(`${label} : valeur non autorisée.`, label);
    return value;
}

/** A real calendar date written YYYY-MM-DD, between 1990 and 2100. */
function parseDate(value, { label, required = true } = {}) {
    if (value === undefined || value === null || value === "") {
        if (required) throw new ValidationError(`${label} est obligatoire.`, label);
        return null;
    }
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new ValidationError(`${label} : format attendu AAAA-MM-JJ.`, label);
    }
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
    if (!real || y < 1990 || y > 2100) throw new ValidationError(`${label} : date invalide.`, label);
    return value;
}

function parseIdList(value, label) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length > 100) {
        throw new ValidationError(`${label} est invalide.`, label);
    }
    return [...new Set(value.map((v) => parseId(v, label)))];
}

function normalizeEmail(value) {
    if (typeof value !== "string") throw new ValidationError("Adresse email invalide.", "email");
    const email = value.trim().toLowerCase();
    if (email.length > 150 || !EMAIL_RE.test(email)) {
        throw new ValidationError("Adresse email invalide.", "email");
    }
    return email;
}

function parsePassword(value) {
    if (typeof value !== "string" || value.length < 8) {
        throw new ValidationError("Le mot de passe doit contenir au moins 8 caractères.", "mot_de_passe");
    }
    // bcrypt only uses the first 72 bytes.
    if (Buffer.byteLength(value, "utf8") > 72) {
        throw new ValidationError("Le mot de passe est trop long (72 octets maximum).", "mot_de_passe");
    }
    return value;
}

function parseCode(value) {
    if (typeof value !== "string" || !/^[0-9]{6}$/.test(value.trim())) {
        throw new ValidationError("Entrez les 6 chiffres du code.", "code");
    }
    return value.trim();
}

function equipementInput(req) {
    const b = body(req);
    return {
        code: parseText(b.code, { label: "Le code", max: 20, required: true }),
        designation: parseText(b.designation, {
            label: "La désignation",
            max: 100,
            required: true,
        }),
        type: parseText(b.type, { label: "Le type", max: 50 }),
        localisation: parseText(b.localisation, {
            label: "La localisation",
            max: 100,
        }),
        etat: parseEnum(b.etat, ETATS, { label: "L'état", fallback: "En service" }),
        date_mise_service: parseDate(b.date_mise_service, {
            label: "La date de mise en service",
        }),
    };
}

function panneInput(req) {
    const b = body(req);
    return {
        equipement_id: parseId(b.equipement_id, "equipement_id"),
        date_panne: parseDate(b.date_panne, { label: "La date de la panne" }),
        description: parseText(b.description, {
            label: "La description",
            max: 2000,
            required: true,
        }),
        priorite: parseEnum(b.priorite, PRIORITES, {
            label: "La priorité",
            fallback: "Moyenne",
        }),
        statut:
            b.statut === undefined ? undefined : parseEnum(b.statut, STATUTS_PANNE, { label: "Le statut" }),
    };
}

function interventionInput(req) {
    const b = body(req);
    return {
        equipement_id: parseId(b.equipement_id, "equipement_id"),
        date_intervention: parseDate(b.date_intervention, {
            label: "La date de l'intervention",
        }),
        technicien: parseText(b.technicien, {
            label: "Le technicien",
            max: 100,
            required: true,
        }),
        observations: parseText(b.observations, {
            label: "Les observations",
            max: 2000,
        }),
        panne_ids: b.panne_ids === undefined ? undefined : parseIdList(b.panne_ids, "panne_ids"),
    };
}

/** Escapes LIKE wildcards so user text is matched literally. */
function likePattern(text) {
    return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

module.exports = {
    ETATS,
    PRIORITES,
    STATUTS_PANNE,
    parseId,
    parseText,
    parseEnum,
    parseDate,
    normalizeEmail,
    parsePassword,
    parseCode,
    equipementInput,
    panneInput,
    interventionInput,
    likePattern,
};
