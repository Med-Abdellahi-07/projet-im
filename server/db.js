"use strict";

const mysql = require("mysql2/promise");

function createPool(dbConfig) {
    return mysql.createPool({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        waitForConnections: true,
        connectionLimit: 10,
        // DATE columns come back as "YYYY-MM-DD" strings (no time zone shifts).
        dateStrings: true,
        // Managed MySQL services (TiDB Cloud, Aiven, ...) require TLS.
        ssl: dbConfig.ssl ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
    });
}

/** Runs fn(connection) inside a transaction; commits on success, rolls back on error. */
async function withTransaction(pool, fn) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await fn(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { createPool, withTransaction };
