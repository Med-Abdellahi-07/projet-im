"use strict";

/**
 * Applies db/schema.sql, then upgrades tables created by the first version
 * of the project (columns added later). Safe to run repeatedly.
 *
 *   npm run migrate
 */

const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

async function columnExists(connection, table, column) {
    const [rows] = await connection.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column],
    );
    return rows.length > 0;
}

async function openConnection(dbConfig) {
    const options = {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        multipleStatements: true,
        ssl: dbConfig.ssl ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
    };
    try {
        return await mysql.createConnection(options);
    } catch (error) {
        if (error.code !== "ER_BAD_DB_ERROR") throw error;
        // Local convenience: create the database when the account is allowed to.
        const { database, ...withoutDb } = options;
        const root = await mysql.createConnection(withoutDb);
        await root.query(`CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, "")}\``);
        await root.end();
        return mysql.createConnection(options);
    }
}

async function migrate(dbConfig) {
    const connection = await openConnection(dbConfig);
    try {
        const schema = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
        await connection.query(schema);

        // Upgrades from the first version of the project.
        if (!(await columnExists(connection, "pannes", "statut"))) {
            await connection.query(
                "ALTER TABLE pannes ADD COLUMN statut ENUM('Ouverte', 'Résolue') NOT NULL DEFAULT 'Ouverte'",
            );
            // Old rows: a breakdown linked to an intervention was considered handled.
            await connection.query(
                `UPDATE pannes SET statut = 'Résolue'
                 WHERE id IN (SELECT panne_id FROM intervention_panne)`,
            );
        }
        if (!(await columnExists(connection, "pannes", "date_resolution"))) {
            await connection.query("ALTER TABLE pannes ADD COLUMN date_resolution DATE NULL");
            await connection.query(
                `UPDATE pannes p
                 JOIN (SELECT ip.panne_id, MIN(i.date_intervention) AS d
                       FROM intervention_panne ip JOIN interventions i ON i.id = ip.intervention_id
                       GROUP BY ip.panne_id) x ON x.panne_id = p.id
                 SET p.date_resolution = x.d WHERE p.statut = 'Résolue'`,
            );
        }
        if (!(await columnExists(connection, "utilisateurs", "tentatives_code"))) {
            await connection.query(
                "ALTER TABLE utilisateurs ADD COLUMN tentatives_code INT NOT NULL DEFAULT 0",
            );
        }
        // Codes are now stored as a SHA-256 digest (64 hex characters).
        await connection.query("ALTER TABLE utilisateurs MODIFY code_verification VARCHAR(64)");
        // Old plain 6-digit codes cannot be compared anymore: cancel them.
        await connection.query(
            "UPDATE utilisateurs SET code_verification = NULL WHERE code_verification REGEXP '^[0-9]{6}$'",
        );
    } finally {
        await connection.end();
    }
}

module.exports = { migrate };

if (require.main === module) {
    require("dotenv").config({ quiet: true });
    const { loadConfig } = require("./config");
    const { db } = loadConfig({
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || "development",
    });
    migrate(db).then(
        () => console.log("Database schema is up to date."),
        (error) => {
            console.error("Migration failed:", error.message);
            process.exit(1);
        },
    );
}
