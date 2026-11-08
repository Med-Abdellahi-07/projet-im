"use strict";

const express = require("express");
const { HttpError, ValidationError } = require("../errors");
const { parseId, interventionInput } = require("../validation");
const { withTransaction } = require("../db");
const { refreshEquipementState } = require("../services/state");

const SELECT_LIST = `SELECT i.id, i.date_intervention, i.technicien, i.observations,
                            e.id AS equipement_id, e.code, e.designation,
                            GROUP_CONCAT(p.description ORDER BY p.id SEPARATOR ' | ') AS pannes_resolues
                     FROM interventions i
                     JOIN equipements e ON e.id = i.equipement_id
                     LEFT JOIN intervention_panne ip ON ip.intervention_id = i.id
                     LEFT JOIN pannes p ON p.id = ip.panne_id`;

async function requireEquipement(connection, id) {
    const [rows] = await connection.query("SELECT id FROM equipements WHERE id = ?", [id]);
    if (rows.length === 0) throw new ValidationError("Équipement introuvable.", "equipement_id");
}

async function linkedPanneIds(connection, interventionId) {
    const [rows] = await connection.query(
        "SELECT panne_id FROM intervention_panne WHERE intervention_id = ?",
        [interventionId],
    );
    return rows.map((r) => r.panne_id);
}

/** Reopens breakdowns that no intervention resolves anymore. */
async function reopenOrphans(connection, panneIds) {
    for (const panneId of panneIds) {
        const [[{ n }]] = await connection.query(
            "SELECT COUNT(*) AS n FROM intervention_panne WHERE panne_id = ?",
            [panneId],
        );
        if (n === 0) {
            await connection.query(
                "UPDATE pannes SET statut = 'Ouverte', date_resolution = NULL WHERE id = ?",
                [panneId],
            );
        }
    }
}

/**
 * Makes the links of an intervention equal to `panneIds`:
 *  - selected breakdowns become "Résolue" (resolution date = intervention date);
 *  - breakdowns that were unselected and have no other intervention are reopened.
 */
async function setLinks(connection, interventionId, equipementId, date, panneIds) {
    if (panneIds.length > 0) {
        const [owned] = await connection.query(
            "SELECT id FROM pannes WHERE equipement_id = ? AND id IN (?)",
            [equipementId, panneIds],
        );
        if (owned.length !== panneIds.length) {
            throw new ValidationError(
                "Une panne sélectionnée n'appartient pas à cet équipement.",
                "panne_ids",
            );
        }
    }

    const previous = await linkedPanneIds(connection, interventionId);
    const removed = previous.filter((id) => !panneIds.includes(id));
    if (removed.length > 0) {
        await connection.query(
            "DELETE FROM intervention_panne WHERE intervention_id = ? AND panne_id IN (?)",
            [interventionId, removed],
        );
        await reopenOrphans(connection, removed);
    }

    for (const panneId of panneIds) {
        await connection.query(
            "INSERT IGNORE INTO intervention_panne (intervention_id, panne_id) VALUES (?, ?)",
            [interventionId, panneId],
        );
        const [[{ n }]] = await connection.query(
            "SELECT COUNT(*) AS n FROM intervention_panne WHERE panne_id = ?",
            [panneId],
        );
        // Resolved by this intervention alone: follow its date. Otherwise keep the first date.
        await connection.query(
            // Note: MySQL evaluates SET assignments left to right, so date_resolution
            // must be computed before statut is overwritten.
            `UPDATE pannes SET
                    date_resolution = IF(? = 1 OR statut = 'Ouverte' OR date_resolution IS NULL, ?, date_resolution),
                    statut = 'Résolue'
             WHERE id = ?`,
            [n, date, panneId],
        );
    }
}

function interventionsRoutes({ pool }) {
    const router = express.Router();

    router.get("/", async (req, res) => {
        const [rows] = await pool.query(
            `${SELECT_LIST} GROUP BY i.id ORDER BY i.date_intervention DESC, i.id DESC`,
        );
        res.json(rows);
    });

    router.get("/:id", async (req, res) => {
        const id = parseId(req.params.id);
        const [rows] = await pool.query(`${SELECT_LIST} WHERE i.id = ? GROUP BY i.id`, [id]);
        if (rows.length === 0) throw new HttpError(404, "Intervention introuvable.");
        const panneIds = await linkedPanneIds(pool, id);
        res.json({ ...rows[0], panne_ids: panneIds });
    });

    router.post("/", async (req, res) => {
        const data = interventionInput(req);
        const id = await withTransaction(pool, async (connection) => {
            await requireEquipement(connection, data.equipement_id);
            const [result] = await connection.query(
                `INSERT INTO interventions (equipement_id, date_intervention, technicien, observations)
                 VALUES (?, ?, ?, ?)`,
                [data.equipement_id, data.date_intervention, data.technicien, data.observations],
            );
            await setLinks(
                connection,
                result.insertId,
                data.equipement_id,
                data.date_intervention,
                data.panne_ids ?? [],
            );
            await refreshEquipementState(connection, data.equipement_id);
            return result.insertId;
        });
        res.status(201).json({ id, message: "Intervention enregistrée." });
    });

    router.put("/:id", async (req, res) => {
        const id = parseId(req.params.id);
        const data = interventionInput(req);
        await withTransaction(pool, async (connection) => {
            const [rows] = await connection.query("SELECT * FROM interventions WHERE id = ? FOR UPDATE", [
                id,
            ]);
            if (rows.length === 0) throw new HttpError(404, "Intervention introuvable.");
            const current = rows[0];
            await requireEquipement(connection, data.equipement_id);

            const equipmentChanged = current.equipement_id !== data.equipement_id;
            if (equipmentChanged && data.panne_ids === undefined) {
                throw new ValidationError(
                    "Changer d'équipement exige de choisir de nouveau les pannes résolues.",
                    "panne_ids",
                );
            }
            const panneIds = data.panne_ids ?? (await linkedPanneIds(connection, id));

            await connection.query(
                `UPDATE interventions SET equipement_id = ?, date_intervention = ?, technicien = ?, observations = ?
                 WHERE id = ?`,
                [data.equipement_id, data.date_intervention, data.technicien, data.observations, id],
            );
            await setLinks(connection, id, data.equipement_id, data.date_intervention, panneIds);

            await refreshEquipementState(connection, data.equipement_id);
            if (equipmentChanged) await refreshEquipementState(connection, current.equipement_id);
        });
        res.json({ message: "Intervention mise à jour." });
    });

    router.delete("/:id", async (req, res) => {
        const id = parseId(req.params.id);
        await withTransaction(pool, async (connection) => {
            const [rows] = await connection.query(
                "SELECT equipement_id FROM interventions WHERE id = ? FOR UPDATE",
                [id],
            );
            if (rows.length === 0) throw new HttpError(404, "Intervention introuvable.");
            const linked = await linkedPanneIds(connection, id);
            await connection.query("DELETE FROM interventions WHERE id = ?", [id]);
            await reopenOrphans(connection, linked);
            await refreshEquipementState(connection, rows[0].equipement_id);
        });
        res.json({ message: "Intervention supprimée." });
    });

    return router;
}

module.exports = { interventionsRoutes };
