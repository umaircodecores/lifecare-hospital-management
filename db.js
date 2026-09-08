/*  db.js – SQL Server Connection Pool */
require('dotenv').config();

const dbName     = process.env.DB_NAME || 'LifeCareDB';
const server     = process.env.DB_SERVER || 'localhost';
const dbUser     = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;

let sql;
let config;

if (dbUser) {
    // Standard SQL Authentication (Works anywhere: Cloud, Vercel, Azure SQL, AWS)
    sql = require('mssql');
    config = {
        user: dbUser,
        password: dbPassword,
        server: server,
        database: dbName,
        options: {
            encrypt: process.env.DB_ENCRYPT === 'true' || false,
            trustServerCertificate: true
        },
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
    };
} else {
    // Local Windows Authentication fallback (ODBC)
    try {
        sql = require('mssql/msnodesqlv8');
        config = {
            connectionString: `Driver={ODBC Driver 17 for SQL Server};Server=${server};Database=${dbName};Trusted_Connection=yes;Encrypt=yes;TrustServerCertificate=yes;`,
            pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
        };
    } catch (err) {
        sql = require('mssql');
        config = {
            server: server,
            database: dbName,
            options: { trustServerCertificate: true },
            pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
        };
    }
}

/* ── Singleton pool ─────────────────────────────────────────────── */
let pool = null;

async function getPool() {
    if (!pool) {
        // Must pass config object that contains connectionString for mssql pool!
        pool = await sql.connect(config);
        console.log(`✔  Connected to SQL Server – ${dbName}`);
    }
    return pool;
}

module.exports = { sql, getPool };
