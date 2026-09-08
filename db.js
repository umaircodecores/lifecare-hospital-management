/*  db.js – SQL Server Connection Pool */
const sql = require('mssql/msnodesqlv8');
require('dotenv').config();

const dbName = process.env.DB_NAME || 'LifeCareDB';
const server = process.env.DB_SERVER || 'localhost';

const config = {
    connectionString: `Driver={ODBC Driver 17 for SQL Server};Server=${server};Database=${dbName};Trusted_Connection=yes;Encrypt=yes;TrustServerCertificate=yes;`,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

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
