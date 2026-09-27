/* =========================================================
   base_donnees.sql
   Base de données du projet "Industriel et Minier"
   ========================================================= */

/* -- Étape 1 : Créer la base de données -- */
CREATE DATABASE IF NOT EXISTS industriel_minier;
USE industriel_minier;

/* =========================================================
   TABLE 0 : utilisateurs (authentification)
   ========================================================= */
CREATE TABLE utilisateurs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(150) NOT NULL UNIQUE,
    mot_de_passe_hash VARCHAR(255) NOT NULL,
    code_verification VARCHAR(6),
    code_expiration DATETIME,
    verifie TINYINT(1) NOT NULL DEFAULT 0,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

/* Explication :
   - mot_de_passe_hash : jamais le mot de passe en clair, toujours
     un hachage (bcrypt) calculé côté serveur.
   - code_verification : code à 6 chiffres envoyé par email lors
     de l'inscription, à saisir pour activer le compte.
   - code_expiration : le code n'est valable que 15 minutes.
   - verifie : passe à 1 une fois le code confirmé. Un compte non
     vérifié ne peut pas se connecter.
*/

/* =========================================================
   TABLE 1 : equipements
   ========================================================= */
CREATE TABLE equipements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    designation VARCHAR(100) NOT NULL,
    type VARCHAR(50),
    localisation VARCHAR(100),
    etat ENUM('En service', 'En panne', 'En maintenance') DEFAULT 'En service',
    date_mise_service DATE
);

/* Explication des colonnes :
   - id                : clé primaire, générée automatiquement (1, 2, 3...)
   - code              : identifiant métier de l'équipement, doit être unique
   - designation       : nom de l'équipement
   - type              : catégorie (pompe, camion, foreuse...)
   - localisation      : où se trouve l'équipement
   - etat              : ENUM = liste de valeurs autorisées uniquement
   - date_mise_service : date d'installation de l'équipement
*/

/* =========================================================
   TABLE 2 : pannes
   ========================================================= */
CREATE TABLE pannes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipement_id INT NOT NULL,
    date_panne DATE NOT NULL,
    description TEXT,
    priorite ENUM('Basse', 'Moyenne', 'Haute') DEFAULT 'Moyenne',
    FOREIGN KEY (equipement_id) REFERENCES equipements(id)
        ON DELETE CASCADE
);

/* Explication :
   - equipement_id  : clé étrangère -> pointe vers equipements.id
   - ON DELETE CASCADE : si un équipement est supprimé, ses pannes
     sont supprimées automatiquement avec lui (évite les pannes
     orphelines qui pointeraient vers un équipement inexistant)
*/

/* =========================================================
   TABLE 3 : interventions
   ========================================================= */
CREATE TABLE interventions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipement_id INT NOT NULL,
    date_intervention DATE NOT NULL,
    technicien VARCHAR(100) NOT NULL,
    observations TEXT,
    FOREIGN KEY (equipement_id) REFERENCES equipements(id)
        ON DELETE CASCADE
);

/* =========================================================
   TABLE 4 : intervention_panne (table de jointure / association)
   Relation plusieurs-à-plusieurs entre Intervention et Panne :
   une intervention peut résoudre plusieurs pannes, et une panne
   peut nécessiter plusieurs interventions.
   ========================================================= */
CREATE TABLE intervention_panne (
    intervention_id INT NOT NULL,
    panne_id INT NOT NULL,
    PRIMARY KEY (intervention_id, panne_id),
    FOREIGN KEY (intervention_id) REFERENCES interventions(id)
        ON DELETE CASCADE,
    FOREIGN KEY (panne_id) REFERENCES pannes(id)
        ON DELETE CASCADE
);

/* Explication :
   Une relation *—* ne peut pas se faire avec une seule clé étrangère
   (contrairement à Équipement -> Panne qui est 1—*). Il faut une
   table intermédiaire avec les deux clés étrangères. La clé primaire
   composée (intervention_id + panne_id) empêche d'enregistrer deux
   fois le même lien.
*/

/* =========================================================
   DONNÉES DE TEST (facultatif, pour vérifier que ça marche)
   ========================================================= */

INSERT INTO equipements (code, designation, type, localisation, etat, date_mise_service)
VALUES
    ('EQ001', 'Pompe hydraulique', 'Pompe', 'Zone A', 'En service', '2023-01-15'),
    ('EQ002', 'Camion benne', 'Véhicule', 'Zone B', 'En panne', '2022-06-10'),
    ('EQ003', 'Foreuse électrique', 'Foreuse', 'Zone C', 'En maintenance', '2021-11-20');

INSERT INTO pannes (equipement_id, date_panne, description, priorite)
VALUES
    (2, '2026-09-20', 'Fuite hydraulique importante', 'Haute');

INSERT INTO interventions (equipement_id, date_intervention, technicien, observations)
VALUES
    (3, '2026-09-22', 'Ahmed Benali', 'Remplacement du moteur, tests effectués');

/* =========================================================
   REQUÊTES SQL DE BASE (CRUD)
   ========================================================= */

/* --- CREATE (ajouter) --- */
-- INSERT INTO equipements (code, designation, type, localisation, etat, date_mise_service)
-- VALUES ('EQ004', 'Compresseur', 'Compresseur', 'Zone D', 'En service', '2024-03-01');

/* --- READ (lire / consulter) --- */
SELECT * FROM equipements;

-- Un seul équipement par son code
-- SELECT * FROM equipements WHERE code = 'EQ001';

/* --- UPDATE (modifier) --- */
-- Changer l'état d'un équipement après une panne
-- UPDATE equipements SET etat = 'En panne' WHERE code = 'EQ001';

/* --- DELETE (supprimer) --- */
-- DELETE FROM equipements WHERE code = 'EQ004';

/* =========================================================
   REQUÊTES DE RECHERCHE / FILTRAGE
   ========================================================= */

-- Rechercher par code ou localisation (contient le texte)
-- SELECT * FROM equipements WHERE code LIKE '%EQ%' OR localisation LIKE '%Zone%';

-- Filtrer par état
-- SELECT * FROM equipements WHERE etat = 'En panne';

-- Filtrer par type
-- SELECT * FROM equipements WHERE type = 'Pompe';

/* =========================================================
   REQUÊTES AVEC JOINTURE (JOIN)
   Afficher les pannes avec le nom de l'équipement concerné
   ========================================================= */

SELECT
    equipements.code,
    equipements.designation,
    pannes.date_panne,
    pannes.description,
    pannes.priorite
FROM pannes
JOIN equipements ON pannes.equipement_id = equipements.id;

/* Explication du JOIN :
   La table pannes ne connaît que l'ID de l'équipement (equipement_id).
   Le JOIN permet de "relier" les deux tables pour afficher aussi
   le code et la désignation de l'équipement, au lieu d'un simple
   numéro sans signification.
*/

/* =========================================================
   REQUÊTES POUR LE TABLEAU DE BORD
   ========================================================= */

-- Nombre d'équipements par état
SELECT etat, COUNT(*) AS nombre
FROM equipements
GROUP BY etat;

-- Nombre total de pannes et d'interventions
SELECT
    (SELECT COUNT(*) FROM equipements) AS total_equipements,
    (SELECT COUNT(*) FROM pannes) AS total_pannes,
    (SELECT COUNT(*) FROM interventions) AS total_interventions;
