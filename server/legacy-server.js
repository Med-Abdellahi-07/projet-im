/* =========================================================
   server.js
   Le serveur backend : le "pont" entre les pages web (HTML/JS)
   et la base de données MySQL. Gère aussi l'authentification
   (inscription, vérification par code email, connexion).
   ========================================================= */

require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

/* ---------------------------------------------------------
   Connexion à la base de données MySQL
   --------------------------------------------------------- */
const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "industriel_minier",
    waitForConnections: true,
    connectionLimit: 10
});

/* ---------------------------------------------------------
   Envoi d'email (code de vérification)
   Si les variables SMTP ne sont pas configurées dans .env,
   on n'envoie pas de vrai email : le code est simplement
   affiché dans la console, pour pouvoir tester sans compte
   email réel.
   --------------------------------------------------------- */
const smtpConfigure = Boolean(process.env.SMTP_UTILISATEUR && process.env.SMTP_MOT_DE_PASSE);

const transporteur = smtpConfigure
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOTE,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_UTILISATEUR,
            pass: process.env.SMTP_MOT_DE_PASSE
        }
    })
    : null;

async function envoyerCodeVerification(email, code) {
    if (!transporteur) {
        console.log(`[MODE TEST - pas de SMTP configuré] Code de vérification pour ${email} : ${code}`);
        return;
    }

    try {
        await transporteur.sendMail({
            from: process.env.SMTP_UTILISATEUR,
            to: email,
            subject: "Code de vérification - Industriel et Minier",
            text: `Votre code de vérification est : ${code} (valable 15 minutes).`,
            html: `<p>Votre code de vérification est : <strong>${code}</strong></p><p>Il est valable 15 minutes.</p>`
        });
    } catch (erreur) {
        console.error("Erreur lors de l'envoi de l'email :", erreur.message);
        console.log(`[Repli] Code de vérification pour ${email} : ${code}`);
    }
}

function genererCode6Chiffres() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

/* =========================================================
   ROUTES : AUTHENTIFICATION
   ========================================================= */

/* POST /api/auth/inscription
   Crée un compte non vérifié + envoie un code par email */
app.post("/api/auth/inscription", async (req, res) => {
    try {
        const { email, mot_de_passe } = req.body;

        if (!email || !mot_de_passe) {
            return res.status(400).json({ message: "Email et mot de passe sont obligatoires." });
        }
        if (mot_de_passe.length < 6) {
            return res.status(400).json({ message: "Le mot de passe doit contenir au moins 6 caractères." });
        }

        const motDePasseHash = await bcrypt.hash(mot_de_passe, 10);
        const code = genererCode6Chiffres();
        const expiration = new Date(Date.now() + 15 * 60 * 1000); // +15 minutes

        await pool.query(
            `INSERT INTO utilisateurs (email, mot_de_passe_hash, code_verification, code_expiration, verifie)
             VALUES (?, ?, ?, ?, 0)`,
            [email, motDePasseHash, code, expiration]
        );

        await envoyerCodeVerification(email, code);

        res.status(201).json({
            message: "Compte créé. Un code de vérification a été envoyé par email.",
            /* Le code n'est renvoyé ici que si aucun serveur SMTP
               n'est configuré, uniquement pour pouvoir tester
               l'application sans vraie boîte email. */
            codeDeTest: smtpConfigure ? undefined : code
        });
    } catch (erreur) {
        if (erreur.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ message: "Un compte existe déjà avec cet email." });
        }
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur." });
    }
});

/* POST /api/auth/verification
   Vérifie le code reçu par email et active le compte */
app.post("/api/auth/verification", async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({ message: "Email et code sont obligatoires." });
        }

        const [lignes] = await pool.query(
            "SELECT * FROM utilisateurs WHERE email = ?",
            [email]
        );

        if (lignes.length === 0) {
            return res.status(404).json({ message: "Aucun compte trouvé avec cet email." });
        }

        const utilisateur = lignes[0];

        if (utilisateur.verifie) {
            return res.status(400).json({ message: "Ce compte est déjà vérifié." });
        }

        if (utilisateur.code_verification !== code) {
            return res.status(400).json({ message: "Code incorrect." });
        }

        if (new Date(utilisateur.code_expiration) < new Date()) {
            return res.status(400).json({ message: "Ce code a expiré. Demande un nouveau code." });
        }

        await pool.query(
            "UPDATE utilisateurs SET verifie = 1, code_verification = NULL WHERE id = ?",
            [utilisateur.id]
        );

        res.json({ message: "Compte vérifié avec succès. Tu peux te connecter." });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur." });
    }
});

/* POST /api/auth/renvoyer-code */
app.post("/api/auth/renvoyer-code", async (req, res) => {
    try {
        const { email } = req.body;
        const [lignes] = await pool.query("SELECT * FROM utilisateurs WHERE email = ?", [email]);

        if (lignes.length === 0) {
            return res.status(404).json({ message: "Aucun compte trouvé avec cet email." });
        }
        if (lignes[0].verifie) {
            return res.status(400).json({ message: "Ce compte est déjà vérifié." });
        }

        const code = genererCode6Chiffres();
        const expiration = new Date(Date.now() + 15 * 60 * 1000);

        await pool.query(
            "UPDATE utilisateurs SET code_verification = ?, code_expiration = ? WHERE email = ?",
            [code, expiration, email]
        );

        await envoyerCodeVerification(email, code);

        res.json({
            message: "Un nouveau code a été envoyé.",
            codeDeTest: smtpConfigure ? undefined : code
        });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur." });
    }
});

/* POST /api/auth/connexion */
app.post("/api/auth/connexion", async (req, res) => {
    try {
        const { email, mot_de_passe } = req.body;

        if (!email || !mot_de_passe) {
            return res.status(400).json({ message: "Email et mot de passe sont obligatoires." });
        }

        const [lignes] = await pool.query("SELECT * FROM utilisateurs WHERE email = ?", [email]);

        if (lignes.length === 0) {
            return res.status(401).json({ message: "Email ou mot de passe incorrect." });
        }

        const utilisateur = lignes[0];

        const motDePasseValide = await bcrypt.compare(mot_de_passe, utilisateur.mot_de_passe_hash);
        if (!motDePasseValide) {
            return res.status(401).json({ message: "Email ou mot de passe incorrect." });
        }

        if (!utilisateur.verifie) {
            return res.status(403).json({
                message: "Ce compte n'est pas encore vérifié.",
                nonVerifie: true
            });
        }

        res.json({
            message: "Connexion réussie.",
            utilisateur: { id: utilisateur.id, email: utilisateur.email }
        });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur." });
    }
});

/* =========================================================
   ROUTES : ÉQUIPEMENTS
   ========================================================= */

app.get("/api/equipements", async (req, res) => {
    try {
        const { recherche, type, etat } = req.query;

        let sql = "SELECT * FROM equipements WHERE 1=1";
        const valeurs = [];

        if (recherche) {
            sql += " AND (code LIKE ? OR localisation LIKE ?)";
            valeurs.push(`%${recherche}%`, `%${recherche}%`);
        }
        if (type) {
            sql += " AND type LIKE ?";
            valeurs.push(`%${type}%`);
        }
        if (etat) {
            sql += " AND etat = ?";
            valeurs.push(etat);
        }

        const [lignes] = await pool.query(sql, valeurs);
        res.json(lignes);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

app.post("/api/equipements", async (req, res) => {
    try {
        const { code, designation, type, localisation, etat, date_mise_service } = req.body;

        if (!code || !designation || !date_mise_service) {
            return res.status(400).json({ message: "Code, désignation et date sont obligatoires." });
        }

        const [resultat] = await pool.query(
            `INSERT INTO equipements (code, designation, type, localisation, etat, date_mise_service)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [code, designation, type, localisation, etat || "En service", date_mise_service]
        );

        res.status(201).json({ id: resultat.insertId, message: "Équipement ajouté." });
    } catch (erreur) {
        if (erreur.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ message: "Ce code existe déjà." });
        }
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

app.put("/api/equipements/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { code, designation, type, localisation, etat, date_mise_service } = req.body;

        await pool.query(
            `UPDATE equipements
             SET code = ?, designation = ?, type = ?, localisation = ?, etat = ?, date_mise_service = ?
             WHERE id = ?`,
            [code, designation, type, localisation, etat, date_mise_service, id]
        );

        res.json({ message: "Équipement mis à jour." });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

app.delete("/api/equipements/:id", async (req, res) => {
    try {
        await pool.query("DELETE FROM equipements WHERE id = ?", [req.params.id]);
        res.json({ message: "Équipement supprimé." });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

/* =========================================================
   ROUTES : PANNES
   ========================================================= */

app.get("/api/pannes", async (req, res) => {
    try {
        const [lignes] = await pool.query(
            `SELECT pannes.id, pannes.date_panne, pannes.description, pannes.priorite,
                    equipements.id AS equipement_id, equipements.code, equipements.designation
             FROM pannes
             JOIN equipements ON pannes.equipement_id = equipements.id
             ORDER BY pannes.date_panne DESC`
        );
        res.json(lignes);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

app.post("/api/pannes", async (req, res) => {
    const connexion = await pool.getConnection();
    try {
        const { equipement_id, date_panne, description, priorite } = req.body;

        if (!equipement_id || !date_panne || !description) {
            connexion.release();
            return res.status(400).json({ message: "Équipement, date et description sont obligatoires." });
        }

        await connexion.beginTransaction();

        const [resultat] = await connexion.query(
            `INSERT INTO pannes (equipement_id, date_panne, description, priorite)
             VALUES (?, ?, ?, ?)`,
            [equipement_id, date_panne, description, priorite || "Moyenne"]
        );

        await connexion.query(
            "UPDATE equipements SET etat = 'En panne' WHERE id = ?",
            [equipement_id]
        );

        await connexion.commit();
        res.status(201).json({ id: resultat.insertId, message: "Panne déclarée." });
    } catch (erreur) {
        await connexion.rollback();
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    } finally {
        connexion.release();
    }
});

/* PUT /api/pannes/:id -> modifier une panne existante */
app.put("/api/pannes/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { equipement_id, date_panne, description, priorite } = req.body;

        await pool.query(
            `UPDATE pannes
             SET equipement_id = ?, date_panne = ?, description = ?, priorite = ?
             WHERE id = ?`,
            [equipement_id, date_panne, description, priorite, id]
        );

        res.json({ message: "Panne mise à jour." });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

app.delete("/api/pannes/:id", async (req, res) => {
    try {
        await pool.query("DELETE FROM pannes WHERE id = ?", [req.params.id]);
        res.json({ message: "Panne supprimée." });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

/* =========================================================
   ROUTES : INTERVENTIONS
   ========================================================= */

/* GET /api/interventions
   Inclut, pour chaque intervention, la liste des pannes qu'elle
   résout (relation *—* via la table intervention_panne). */
app.get("/api/interventions", async (req, res) => {
    try {
        const [lignes] = await pool.query(
            `SELECT interventions.id, interventions.date_intervention, interventions.technicien,
                    interventions.observations,
                    equipements.id AS equipement_id, equipements.code, equipements.designation,
                    GROUP_CONCAT(pannes.description SEPARATOR ' | ') AS pannes_resolues
             FROM interventions
             JOIN equipements ON interventions.equipement_id = equipements.id
             LEFT JOIN intervention_panne ON intervention_panne.intervention_id = interventions.id
             LEFT JOIN pannes ON pannes.id = intervention_panne.panne_id
             GROUP BY interventions.id
             ORDER BY interventions.date_intervention DESC`
        );
        res.json(lignes);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

/* GET /api/pannes-non-resolues/:equipement_id
   Liste les pannes d'un équipement, utilisée pour proposer
   les pannes à cocher lors d'une intervention. */
app.get("/api/pannes-par-equipement/:equipement_id", async (req, res) => {
    try {
        const [lignes] = await pool.query(
            "SELECT id, date_panne, description, priorite FROM pannes WHERE equipement_id = ? ORDER BY date_panne DESC",
            [req.params.equipement_id]
        );
        res.json(lignes);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

/* POST /api/interventions
   Enregistre l'intervention, la relie aux pannes choisies
   (table intervention_panne), et remet l'équipement en service. */
app.post("/api/interventions", async (req, res) => {
    const connexion = await pool.getConnection();
    try {
        const { equipement_id, date_intervention, technicien, observations, panne_ids } = req.body;

        if (!equipement_id || !date_intervention || !technicien) {
            connexion.release();
            return res.status(400).json({ message: "Équipement, date et technicien sont obligatoires." });
        }

        await connexion.beginTransaction();

        const [resultat] = await connexion.query(
            `INSERT INTO interventions (equipement_id, date_intervention, technicien, observations)
             VALUES (?, ?, ?, ?)`,
            [equipement_id, date_intervention, technicien, observations]
        );

        const interventionId = resultat.insertId;

        if (Array.isArray(panne_ids) && panne_ids.length > 0) {
            const valeurs = panne_ids.map(panneId => [interventionId, panneId]);
            await connexion.query(
                "INSERT INTO intervention_panne (intervention_id, panne_id) VALUES ?",
                [valeurs]
            );
        }

        await connexion.query(
            "UPDATE equipements SET etat = 'En service' WHERE id = ?",
            [equipement_id]
        );

        await connexion.commit();
        res.status(201).json({ id: interventionId, message: "Intervention enregistrée." });
    } catch (erreur) {
        await connexion.rollback();
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    } finally {
        connexion.release();
    }
});

/* PUT /api/interventions/:id -> modifier une intervention */
app.put("/api/interventions/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { equipement_id, date_intervention, technicien, observations } = req.body;

        await pool.query(
            `UPDATE interventions
             SET equipement_id = ?, date_intervention = ?, technicien = ?, observations = ?
             WHERE id = ?`,
            [equipement_id, date_intervention, technicien, observations, id]
        );

        res.json({ message: "Intervention mise à jour." });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

app.delete("/api/interventions/:id", async (req, res) => {
    try {
        await pool.query("DELETE FROM interventions WHERE id = ?", [req.params.id]);
        res.json({ message: "Intervention supprimée." });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

/* =========================================================
   ROUTE : TABLEAU DE BORD
   ========================================================= */

app.get("/api/dashboard", async (req, res) => {
    try {
        const [parEtat] = await pool.query(
            "SELECT etat, COUNT(*) AS nombre FROM equipements GROUP BY etat"
        );
        const [totaux] = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM equipements) AS total_equipements,
                (SELECT COUNT(*) FROM pannes) AS total_pannes,
                (SELECT COUNT(*) FROM interventions) AS total_interventions`
        );

        const compteurs = { "En service": 0, "En panne": 0, "En maintenance": 0 };
        parEtat.forEach(ligne => { compteurs[ligne.etat] = ligne.nombre; });

        res.json({
            totalEquipements: totaux[0].total_equipements,
            enService: compteurs["En service"],
            enPanne: compteurs["En panne"],
            enMaintenance: compteurs["En maintenance"],
            totalPannes: totaux[0].total_pannes,
            totalInterventions: totaux[0].total_interventions
        });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

/* ---------------------------------------------------------
   Démarrage du serveur
   --------------------------------------------------------- */
app.listen(PORT, () => {
    console.log(`Serveur backend démarré sur http://localhost:${PORT}`);
    if (!smtpConfigure) {
        console.log("Aucun SMTP configuré (.env) : les codes de vérification s'afficheront ici, dans la console.");
    }
});
