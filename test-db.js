const sql = require('mssql/msnodesqlv8');
const config = {
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=LifeCareDB;Trusted_Connection=yes;Encrypt=yes;TrustServerCertificate=yes;',
};

async function check() {
    try {
        const pool = await sql.connect(config);
        
        // 1. All tables
        const tables = await pool.request().query(`
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME
        `);
        console.log('=== TABLES ===');
        tables.recordset.forEach(r => console.log(' -', r.TABLE_NAME));
        
        // 2. All columns per table
        const cols = await pool.request().query(`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS ORDER BY TABLE_NAME, ORDINAL_POSITION
        `);
        console.log('\n=== COLUMNS ===');
        let currentTable = '';
        cols.recordset.forEach(r => {
            if (r.TABLE_NAME !== currentTable) {
                currentTable = r.TABLE_NAME;
                console.log('\n[' + currentTable + ']');
            }
            console.log(`  ${r.COLUMN_NAME} (${r.DATA_TYPE}${r.CHARACTER_MAXIMUM_LENGTH ? '(' + r.CHARACTER_MAXIMUM_LENGTH + ')' : ''}) ${r.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
        
        // 3. Sample data counts
        const counts = await pool.request().query(`
            SELECT 'Department' AS T, COUNT(*) AS C FROM Department UNION ALL
            SELECT 'Doctor', COUNT(*) FROM Doctor UNION ALL
            SELECT 'Patient', COUNT(*) FROM Patient UNION ALL
            SELECT 'Appointment', COUNT(*) FROM Appointment UNION ALL
            SELECT 'PharmacyInventory', COUNT(*) FROM PharmacyInventory UNION ALL
            SELECT 'Prescription', COUNT(*) FROM Prescription UNION ALL
            SELECT 'Invoice', COUNT(*) FROM Invoice UNION ALL
            SELECT 'InvoiceItem', COUNT(*) FROM InvoiceItem UNION ALL
            SELECT 'SystemUser', COUNT(*) FROM SystemUser UNION ALL
            SELECT 'MedicalTest', COUNT(*) FROM MedicalTest UNION ALL
            SELECT 'TestPrice', COUNT(*) FROM TestPrice
        `);
        console.log('\n=== ROW COUNTS ===');
        counts.recordset.forEach(r => console.log(`  ${r.T}: ${r.C}`));

        // Check if PrescriptionItem exists
        try {
            const pi = await pool.request().query(`SELECT COUNT(*) AS C FROM PrescriptionItem`);
            console.log(`  PrescriptionItem: ${pi.recordset[0].C}`);
        } catch(e) { console.log('  PrescriptionItem: TABLE NOT FOUND'); }

        // Check if PatientReport exists
        try {
            const pr = await pool.request().query(`SELECT COUNT(*) AS C FROM PatientReport`);
            console.log(`  PatientReport: ${pr.recordset[0].C}`);
        } catch(e) { console.log('  PatientReport: TABLE NOT FOUND'); }

        // 4. SystemUser sample
        const users = await pool.request().query(`SELECT UserID, Username, Role, DoctorID FROM SystemUser`);
        console.log('\n=== SYSTEM USERS ===');
        users.recordset.forEach(r => console.log(`  ${r.Username} (${r.Role}) DoctorID=${r.DoctorID}`));

        // 5. Doctor consultation fees
        try {
            const fees = await pool.request().query(`SELECT DoctorID, Name, ConsultationFee FROM Doctor`);
            console.log('\n=== DOCTOR FEES ===');
            fees.recordset.forEach(r => console.log(`  ${r.Name}: £${r.ConsultationFee}`));
        } catch(e) { console.log('\n  Doctor.ConsultationFee: COLUMN NOT FOUND'); }

        // 6. TestPrice data
        try {
            const tp = await pool.request().query(`SELECT * FROM TestPrice`);
            console.log('\n=== TEST PRICES ===');
            tp.recordset.forEach(r => console.log(`  ${r.TestPriceID}: ${r.TestName} = £${r.Price}`));
        } catch(e) { console.log('\n  TestPrice: TABLE NOT FOUND'); }

        process.exit(0);
    } catch(e) {
        console.error(e.message);
        process.exit(1);
    }
}
check();
