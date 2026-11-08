"use strict";

const express = require("express");

function dashboardRoutes({ pool }) {
    const router = express.Router();

    router.get("/", async (req, res) => {
        const [byState] = await pool.query("SELECT etat, COUNT(*) AS nombre FROM equipements GROUP BY etat");
        const [byPriority] = await pool.query(
            "SELECT priorite, COUNT(*) AS nombre FROM pannes WHERE statut = 'Ouverte' GROUP BY priorite",
        );
        const [[totals]] = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM equipements) AS total_equipements,
                (SELECT COUNT(*) FROM pannes) AS total_pannes,
                (SELECT COUNT(*) FROM pannes WHERE statut = 'Ouverte') AS pannes_ouvertes,
                (SELECT COUNT(*) FROM interventions) AS total_interventions,
                (SELECT COUNT(*) FROM interventions
                  WHERE YEAR(date_intervention) = YEAR(CURDATE())
                    AND MONTH(date_intervention) = MONTH(CURDATE())) AS interventions_ce_mois`,
        );

        const states = { "En service": 0, "En panne": 0, "En maintenance": 0 };
        byState.forEach((row) => {
            states[row.etat] = Number(row.nombre);
        });
        const priorities = { Haute: 0, Moyenne: 0, Basse: 0 };
        byPriority.forEach((row) => {
            priorities[row.priorite] = Number(row.nombre);
        });

        res.json({
            totalEquipements: Number(totals.total_equipements),
            enService: states["En service"],
            enPanne: states["En panne"],
            enMaintenance: states["En maintenance"],
            totalPannes: Number(totals.total_pannes),
            pannesOuvertes: Number(totals.pannes_ouvertes),
            pannesOuvertesParPriorite: priorities,
            totalInterventions: Number(totals.total_interventions),
            interventionsCeMois: Number(totals.interventions_ce_mois),
        });
    });

    return router;
}

module.exports = { dashboardRoutes };
