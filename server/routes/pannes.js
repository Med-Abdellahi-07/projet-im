"use strict";

const express = require("express");
const { HttpError, ValidationError } = require("../errors");
const { STATUTS_PANNE, parseId, panneInput } = require("../validation");
const { withTransaction } = require("../db");
const { refreshEquipementState } = require("../services/state");

const SELECT_PANNE = `SELECT p.id, p.date_panne, p.description, p.priorite, p.statut, p.date_resolution,
                             e.id AS equipement_id, e.code, e.designation
                      FROM pannes p JOIN equipements e ON e.id = p.equipement_id`;

async function requireEquipement(connection, id) {
    const [rows] = await connection.query("SELECT id FROM equipements WHERE id = ?", [id]);
    if (rows.length === 0) throw new ValidationError("Équipement introuvable.", "equipement_id");
}

function pannesRoutes({ pool }) {
    const router = express.Router();

    router.get("/", async (req, res) => {
        const { statut, equipement_id: equipementId } = req.query;
        let sql = `${SELECT_PANNE} WHERE 1=1`;
        const values = [];
        if (statut !== undefined && statut !== "") {
            if (!STATUTS_PANNE.includes(statut)) throw new ValidationError("Statut invalide.", "statut");
            sql += " AND p.statut = ?";
            values.push(statut);
        }
        if (equipementId !== undefined && equipementId !== "") {
            sql += " AND p.equipement_id = ?";
            values.push(parseId(equipementId, "equipement_id"));
        }
        sql += " ORDER BY p.date_panne DESC, p.id DESC";
        const [rows] = await pool.query(sql, values);
        res.json(rows);
    });

    router.get("/:id", async (req, res) => {
        const [rows] = await pool.query(`${SELECT_PANNE} WHERE p.id = ?`, [parseId(req.params.id)]);
        if (rows.length === 0) throw new HttpError(404, "Panne introuvable.");
        res.json(rows[0]);
    });

    router.post("/", async (req, res) => {
        const data = panneInput(req);
        const id = await withTransaction(pool, async (connection) => {
            await requireEquipement(connection, data.equipement_id);
            const [result] = await connection.query(
                `INSERT INTO pannes (equipement_id, date_panne, description, priorite, statut)
                 VALUES (?, ?, ?, ?, 'Ouverte')`,
                [data.equipement_id, data.date_panne, data.description, data.priorite],
            );
            await refreshEquipementState(connection, data.equipement_id);
            return result.insertId;
        });
        res.status(201).json({ id, message: "Panne déclarée." });
    });

    router.put("/:id", async (req, res) => {
        const id = parseId(req.params.id);
        const data = panneInput(req);
        await withTransaction(pool, async (connection) => {
            const [rows] = await connection.query("SELECT * FROM pannes WHERE id = ? FOR UPDATE", [id]);
            if (rows.length === 0) throw new HttpError(404, "Panne introuvable.");
            const current = rows[0];
            await requireEquipement(connection, data.equipement_id);

            const statut = data.statut ?? current.statut;
            let dateResolution = null;
            if (statut === "Résolue") {
                dateResolution =
                    current.statut === "Résolue"
                        ? current.date_resolution
                        : new Date().toISOString().slice(0, 10);
            }

            await connection.query(
                `UPDATE pannes SET equipement_id = ?, date_panne = ?, description = ?, priorite = ?,
                        statut = ?, date_resolution = ? WHERE id = ?`,
                [
                    data.equipement_id,
                    data.date_panne,
                    data.description,
                    data.priorite,
                    statut,
                    dateResolution,
                    id,
                ],
            );

            // A breakdown that is reopened, or moved to another equipment, is no longer
            // "resolved by" the interventions that were linked to it.
            if (statut === "Ouverte" || current.equipement_id !== data.equipement_id) {
                await connection.query("DELETE FROM intervention_panne WHERE panne_id = ?", [id]);
            }

            await refreshEquipementState(connection, data.equipement_id);
            if (current.equipement_id !== data.equipement_id) {
                await refreshEquipementState(connection, current.equipement_id);
            }
        });
        res.json({ message: "Panne mise à jour." });
    });

    router.delete("/:id", async (req, res) => {
        const id = parseId(req.params.id);
        await withTransaction(pool, async (connection) => {
            const [rows] = await connection.query(
                "SELECT equipement_id FROM pannes WHERE id = ? FOR UPDATE",
                [id],
            );
            if (rows.length === 0) throw new HttpError(404, "Panne introuvable.");
            await connection.query("DELETE FROM pannes WHERE id = ?", [id]);
            await refreshEquipementState(connection, rows[0].equipement_id);
        });
        res.json({ message: "Panne supprimée." });
    });

    return router;
}

module.exports = { pannesRoutes };
