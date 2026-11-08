"use strict";

const express = require("express");
const { HttpError, ValidationError } = require("../errors");
const { ETATS, parseId, equipementInput, likePattern } = require("../validation");
const { withTransaction } = require("../db");
const { refreshEquipementState } = require("../services/state");

function equipementsRoutes({ pool }) {
    const router = express.Router();

    router.get("/", async (req, res) => {
        const { recherche, type, etat } = req.query;
        let sql = "SELECT * FROM equipements WHERE 1=1";
        const values = [];

        if (recherche !== undefined) {
            if (typeof recherche !== "string" || recherche.length > 100) {
                throw new ValidationError("Recherche invalide.", "recherche");
            }
            if (recherche.trim()) {
                sql += " AND (code LIKE ? OR localisation LIKE ?)";
                values.push(likePattern(recherche.trim()), likePattern(recherche.trim()));
            }
        }
        if (type !== undefined) {
            if (typeof type !== "string" || type.length > 50)
                throw new ValidationError("Type invalide.", "type");
            if (type.trim()) {
                sql += " AND type LIKE ?";
                values.push(likePattern(type.trim()));
            }
        }
        if (etat !== undefined && etat !== "") {
            if (!ETATS.includes(etat)) throw new ValidationError("État invalide.", "etat");
            sql += " AND etat = ?";
            values.push(etat);
        }
        sql += " ORDER BY code";

        const [rows] = await pool.query(sql, values);
        res.json(rows);
    });

    router.get("/:id", async (req, res) => {
        const [rows] = await pool.query("SELECT * FROM equipements WHERE id = ?", [parseId(req.params.id)]);
        if (rows.length === 0) throw new HttpError(404, "Équipement introuvable.");
        res.json(rows[0]);
    });

    /** All breakdowns of one equipment (used by the intervention form). */
    router.get("/:id/pannes", async (req, res) => {
        const id = parseId(req.params.id);
        const [exists] = await pool.query("SELECT 1 FROM equipements WHERE id = ?", [id]);
        if (exists.length === 0) throw new HttpError(404, "Équipement introuvable.");
        const [rows] = await pool.query(
            `SELECT id, date_panne, description, priorite, statut, date_resolution
             FROM pannes WHERE equipement_id = ? ORDER BY date_panne DESC, id DESC`,
            [id],
        );
        res.json(rows);
    });

    router.post("/", async (req, res) => {
        const data = equipementInput(req);
        try {
            const [result] = await pool.query(
                `INSERT INTO equipements (code, designation, type, localisation, etat, date_mise_service)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    data.code,
                    data.designation,
                    data.type,
                    data.localisation,
                    data.etat,
                    data.date_mise_service,
                ],
            );
            res.status(201).json({ id: result.insertId, message: "Équipement ajouté." });
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY")
                throw new HttpError(409, "Ce code existe déjà.", { champ: "code" });
            throw error;
        }
    });

    router.put("/:id", async (req, res) => {
        const id = parseId(req.params.id);
        const data = equipementInput(req);
        try {
            await withTransaction(pool, async (connection) => {
                const [result] = await connection.query(
                    `UPDATE equipements
                     SET code = ?, designation = ?, type = ?, localisation = ?, etat = ?, date_mise_service = ?
                     WHERE id = ?`,
                    [
                        data.code,
                        data.designation,
                        data.type,
                        data.localisation,
                        data.etat,
                        data.date_mise_service,
                        id,
                    ],
                );
                if (result.affectedRows === 0) {
                    const [rows] = await connection.query("SELECT 1 FROM equipements WHERE id = ?", [id]);
                    if (rows.length === 0) throw new HttpError(404, "Équipement introuvable.");
                }
                // A manual state must not contradict the breakdowns.
                await refreshEquipementState(connection, id);
            });
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY")
                throw new HttpError(409, "Ce code existe déjà.", { champ: "code" });
            throw error;
        }
        res.json({ message: "Équipement mis à jour." });
    });

    router.delete("/:id", async (req, res) => {
        const [result] = await pool.query("DELETE FROM equipements WHERE id = ?", [parseId(req.params.id)]);
        if (result.affectedRows === 0) throw new HttpError(404, "Équipement introuvable.");
        res.json({ message: "Équipement supprimé." });
    });

    return router;
}

module.exports = { equipementsRoutes };
