"use strict";

/**
 * Demo mode (DEMO_MODE=true): the whole database is a demo database.
 * On start and every DEMO_RESET_HOURS hours, all data is replaced by the
 * fictional data below and the only account is the verified demo account,
 * so visitors cannot leave the demo in a broken state.
 *
 * NEVER enable it on a database that holds real data.
 */

const bcrypt = require("bcryptjs");
const { withTransaction } = require("../db");

const day = (offset) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
};

async function resetDemoData(pool, demo) {
    const hash = await bcrypt.hash(demo.password, 10);
    await withTransaction(pool, async (c) => {
        await c.query("DELETE FROM intervention_panne");
        await c.query("DELETE FROM interventions");
        await c.query("DELETE FROM pannes");
        await c.query("DELETE FROM equipements");
        await c.query("DELETE FROM utilisateurs");
        await c.query("INSERT INTO utilisateurs (email, mot_de_passe_hash, verifie) VALUES (?, ?, 1)", [
            demo.email,
            hash,
        ]);

        const equipements = [
            ["EQ001", "Pompe hydraulique", "Pompe", "Zone A", "En service", "2023-01-15"],
            ["EQ002", "Camion benne", "Véhicule", "Zone B", "En service", "2022-06-10"],
            ["EQ003", "Foreuse électrique", "Foreuse", "Zone C", "En maintenance", "2021-11-20"],
            ["EQ004", "Concasseur à mâchoires", "Concasseur", "Zone D", "En service", "2020-03-02"],
            ["EQ005", "Convoyeur à bande", "Convoyeur", "Zone A", "En service", "2024-02-18"],
            ["EQ006", "Compresseur d'air", "Compresseur", "Zone C", "En service", "2023-09-05"],
        ];
        const ids = {};
        for (const row of equipements) {
            const [r] = await c.query(
                `INSERT INTO equipements (code, designation, type, localisation, etat, date_mise_service)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                row,
            );
            ids[row[0]] = r.insertId;
        }

        const panne = async (code, offset, description, priorite, statut = "Ouverte", resolved = null) => {
            const [r] = await c.query(
                `INSERT INTO pannes (equipement_id, date_panne, description, priorite, statut, date_resolution)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [ids[code], day(offset), description, priorite, statut, resolved],
            );
            return r.insertId;
        };
        const intervention = async (code, offset, technicien, observations, panneIds) => {
            const [r] = await c.query(
                `INSERT INTO interventions (equipement_id, date_intervention, technicien, observations)
                 VALUES (?, ?, ?, ?)`,
                [ids[code], day(offset), technicien, observations],
            );
            for (const p of panneIds) {
                await c.query("INSERT INTO intervention_panne (intervention_id, panne_id) VALUES (?, ?)", [
                    r.insertId,
                    p,
                ]);
            }
        };

        const p1 = await panne("EQ003", 12, "Surchauffe du moteur", "Haute", "Résolue", day(9));
        await intervention("EQ003", 9, "Technicien A", "Remplacement du ventilateur, tests effectués.", [p1]);
        const p2 = await panne("EQ001", 20, "Fuite sur le flexible principal", "Moyenne", "Résolue", day(18));
        await intervention("EQ001", 18, "Technicien B", "Flexible remplacé, pression vérifiée.", [p2]);
        await panne("EQ002", 3, "Fuite hydraulique importante", "Haute");
        await panne("EQ004", 2, "Vibrations anormales", "Moyenne");
        await panne("EQ005", 1, "Courroie qui patine", "Basse");
        await c.query("UPDATE equipements SET etat = 'En panne' WHERE code IN ('EQ002', 'EQ004', 'EQ005')");
        await intervention("EQ006", 4, "Technicien A", "Maintenance préventive trimestrielle.", []);
    });
}

function startDemoReset(pool, demo) {
    const run = () =>
        resetDemoData(pool, demo).then(
            () => console.log("Demo data reset."),
            (error) => console.error("Demo reset failed:", error.message),
        );
    const timer = setInterval(run, demo.resetHours * 60 * 60 * 1000);
    timer.unref();
    return run();
}

module.exports = { resetDemoData, startDemoReset };
