-- =========================================================
-- Example queries for the "Industriel & Minier" database.
-- These are documentation only: nothing here is run by the app.
-- Table and column names are French because the project is.
-- =========================================================

-- ---- CRUD on equipment ----
-- INSERT INTO equipements (code, designation, type, localisation, etat, date_mise_service)
-- VALUES ('EQ004', 'Compresseur', 'Compresseur', 'Zone D', 'En service', '2024-03-01');

SELECT * FROM equipements;
-- SELECT * FROM equipements WHERE code = 'EQ001';
-- UPDATE equipements SET etat = 'En panne' WHERE code = 'EQ001';
-- DELETE FROM equipements WHERE code = 'EQ004';

-- ---- Search and filters ----
-- Contains text in code or location
-- SELECT * FROM equipements WHERE code LIKE '%EQ%' OR localisation LIKE '%Zone%';
-- By state or by type
-- SELECT * FROM equipements WHERE etat = 'En panne';
-- SELECT * FROM equipements WHERE type = 'Pompe';

-- ---- JOIN: breakdowns with the equipment concerned ----
SELECT e.code, e.designation, p.date_panne, p.description, p.priorite, p.statut
FROM pannes p
JOIN equipements e ON e.id = p.equipement_id
ORDER BY p.date_panne DESC;

-- ---- Many-to-many: which breakdowns each intervention resolves ----
SELECT i.id, i.date_intervention, i.technicien,
       GROUP_CONCAT(p.description SEPARATOR ' | ') AS pannes_resolues
FROM interventions i
LEFT JOIN intervention_panne ip ON ip.intervention_id = i.id
LEFT JOIN pannes p ON p.id = ip.panne_id
GROUP BY i.id;

-- ---- Dashboard ----
SELECT etat, COUNT(*) AS nombre FROM equipements GROUP BY etat;

SELECT
    (SELECT COUNT(*) FROM equipements)   AS total_equipements,
    (SELECT COUNT(*) FROM pannes)        AS total_pannes,
    (SELECT COUNT(*) FROM interventions) AS total_interventions;

-- Open breakdowns, by priority
SELECT priorite, COUNT(*) AS nombre FROM pannes WHERE statut = 'Ouverte' GROUP BY priorite;

-- Interventions of the current month
SELECT COUNT(*) FROM interventions
WHERE YEAR(date_intervention) = YEAR(CURDATE()) AND MONTH(date_intervention) = MONTH(CURDATE());

-- Equipment that should be "En panne" (it has at least one open breakdown)
SELECT e.id, e.code
FROM equipements e
WHERE EXISTS (SELECT 1 FROM pannes p WHERE p.equipement_id = e.id AND p.statut = 'Ouverte');
