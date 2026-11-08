"use strict";

/**
 * Keeps equipment.etat consistent with its breakdowns.
 *
 *  - at least one open breakdown and the equipment is "En service" -> "En panne"
 *  - no open breakdown left and the equipment is "En panne"        -> "En service"
 *  - "En maintenance" is a manual state and is never changed here.
 *
 * Always call it inside the same transaction that changed the breakdowns.
 */
async function refreshEquipementState(connection, equipementId) {
    const [[{ ouvertes }]] = await connection.query(
        "SELECT COUNT(*) AS ouvertes FROM pannes WHERE equipement_id = ? AND statut = 'Ouverte'",
        [equipementId],
    );
    if (ouvertes > 0) {
        await connection.query(
            "UPDATE equipements SET etat = 'En panne' WHERE id = ? AND etat = 'En service'",
            [equipementId],
        );
    } else {
        await connection.query(
            "UPDATE equipements SET etat = 'En service' WHERE id = ? AND etat = 'En panne'",
            [equipementId],
        );
    }
}

module.exports = { refreshEquipementState };
