-- =========================================================
-- Schema of the "Industriel & Minier" database.
--
-- This file is idempotent: it can be run any number of times.
-- It is normally applied with "npm run migrate", which also
-- upgrades databases created by the first version of the
-- project (see server/migrate.js).
-- Example queries live in docs/queries.sql.
-- =========================================================

-- Accounts (authentication)
CREATE TABLE IF NOT EXISTS utilisateurs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(150) NOT NULL UNIQUE,
    mot_de_passe_hash VARCHAR(255) NOT NULL,
    -- SHA-256 hex digest of the 6-digit code, never the code itself
    code_verification VARCHAR(64),
    code_expiration DATETIME,
    -- wrong attempts on the current code (the code is cancelled after 5)
    tentatives_code INT NOT NULL DEFAULT 0,
    verifie TINYINT(1) NOT NULL DEFAULT 0,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Equipment being tracked
CREATE TABLE IF NOT EXISTS equipements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    designation VARCHAR(100) NOT NULL,
    type VARCHAR(50),
    localisation VARCHAR(100),
    etat ENUM('En service', 'En panne', 'En maintenance') NOT NULL DEFAULT 'En service',
    date_mise_service DATE
);

-- Breakdowns (1 equipment -> n breakdowns)
CREATE TABLE IF NOT EXISTS pannes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipement_id INT NOT NULL,
    date_panne DATE NOT NULL,
    description TEXT,
    priorite ENUM('Basse', 'Moyenne', 'Haute') NOT NULL DEFAULT 'Moyenne',
    statut ENUM('Ouverte', 'Résolue') NOT NULL DEFAULT 'Ouverte',
    date_resolution DATE NULL,
    FOREIGN KEY (equipement_id) REFERENCES equipements(id) ON DELETE CASCADE
);

-- Maintenance interventions (1 equipment -> n interventions)
CREATE TABLE IF NOT EXISTS interventions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipement_id INT NOT NULL,
    date_intervention DATE NOT NULL,
    technicien VARCHAR(100) NOT NULL,
    observations TEXT,
    FOREIGN KEY (equipement_id) REFERENCES equipements(id) ON DELETE CASCADE
);

-- Many-to-many link: which breakdowns an intervention resolves
CREATE TABLE IF NOT EXISTS intervention_panne (
    intervention_id INT NOT NULL,
    panne_id INT NOT NULL,
    PRIMARY KEY (intervention_id, panne_id),
    FOREIGN KEY (intervention_id) REFERENCES interventions(id) ON DELETE CASCADE,
    FOREIGN KEY (panne_id) REFERENCES pannes(id) ON DELETE CASCADE
);
