/*  server.js – LifeCare Hospital Management API (Final)
 *  ─────────────────────────────────────────────────────
 *  Matches exact schema: Doctor.ConsultationFee, PrescriptionItem,
 *  TestPrice + MedicalTest.TestPriceID, PatientReport, Patient.Gender,
 *  Invoice.ConsultationFee, SystemUser.CreatedAt.
 *  Run:  node server.js
 */

const express  = require('express');
const cors     = require('cors');
const jwt      = require('jsonwebtoken');
const path     = require('path');
require('dotenv').config();

const { sql, getPool }            = require('./db');
const { verifyToken, authorise }  = require('./auth');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

/* ── Global middleware ──────────────────────────────────────────── */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ================================================================
   AUTH – POST /api/login
   ================================================================ */
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ error: 'Username and password are required.' });

        const pool   = await getPool();
        const result = await pool.request()
            .input('Username', sql.VarChar, username)
            .input('Password', sql.VarChar, password)
            .execute('sp_Login');

        if (!result.recordset || result.recordset.length === 0)
            return res.status(401).json({ error: 'Invalid username or password.' });

        const user    = result.recordset[0];
        const payload = { id: user.UserID, username: user.Username, role: user.Role, doctorId: user.DoctorID || null };
        const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: payload });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

/* ================================================================
   PATIENTS
   ================================================================ */

// POST /api/patients – register (with Gender)
app.post('/api/patients', verifyToken, authorise('Receptionist', 'Admin'), async (req, res) => {
    try {
        const { nhsNumber, firstName, lastName, dob, gender, address, phone, email } = req.body;
        if (!nhsNumber || !firstName || !lastName || !dob)
            return res.status(400).json({ error: 'NHS Number, first name, last name, and DOB are required.' });

        if (!/^\d{3}\s\d{3}\s\d{4}$/.test(nhsNumber))
            return res.status(400).json({ error: 'NHS Number must be in format: 123 456 7890.' });

        const pool = await getPool();

        const exists = await pool.request()
            .input('NHS', sql.VarChar, nhsNumber)
            .query('SELECT PatientID FROM Patient WHERE NHSNumber = @NHS');
        if (exists.recordset.length > 0)
            return res.status(409).json({ error: 'A patient with this NHS Number already exists.' });

        const result = await pool.request()
            .input('NHSNumber',  sql.VarChar, nhsNumber)
            .input('FirstName',  sql.VarChar, firstName)
            .input('LastName',   sql.VarChar, lastName)
            .input('DOB',        sql.Date,    dob)
            .input('Gender',     sql.VarChar, gender || null)
            .input('Address',    sql.VarChar, address  || '')
            .input('Phone',      sql.VarChar, phone    || '')
            .input('Email',      sql.VarChar, email    || '')
            .query(`INSERT INTO Patient (NHSNumber, FirstName, LastName, DOB, Gender, Address, Phone, Email)
                    OUTPUT INSERTED.PatientID
                    VALUES (@NHSNumber, @FirstName, @LastName, @DOB, @Gender, @Address, @Phone, @Email)`);

        res.status(201).json({ patientId: result.recordset[0].PatientID, name: `${firstName} ${lastName}`, nhsNumber, message: 'Patient registered successfully.' });
    } catch (err) {
        console.error('Register patient error:', err);
        res.status(500).json({ error: 'Failed to register patient.' });
    }
});

// GET /api/patients?search=...
app.get('/api/patients', verifyToken, async (req, res) => {
    try {
        const search = req.query.search || '';
        const pool   = await getPool();
        const result = await pool.request()
            .input('Search', sql.VarChar, `%${search}%`)
            .query(`SELECT PatientID, NHSNumber, FirstName, LastName, DOB, Gender, Address, Phone, Email,
                           DATEDIFF(YEAR, DOB, GETDATE()) -
                               CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, DOB, GETDATE()), DOB) > GETDATE()
                                    THEN 1 ELSE 0 END AS Age
                    FROM Patient
                    WHERE FirstName LIKE @Search OR LastName LIKE @Search OR NHSNumber LIKE @Search
                    ORDER BY LastName, FirstName`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Search patients error:', err);
        res.status(500).json({ error: 'Failed to search patients.' });
    }
});

// GET /api/patients/search?q=... – lightweight typeahead
app.get('/api/patients/search', verifyToken, async (req, res) => {
    try {
        const q = req.query.q || '';
        if (q.length < 1) return res.json([]);
        const pool   = await getPool();
        const result = await pool.request()
            .input('Q', sql.VarChar, `%${q}%`)
            .query(`SELECT TOP 10 PatientID, FirstName + ' ' + LastName AS Name, NHSNumber, DOB, Gender
                    FROM Patient
                    WHERE FirstName LIKE @Q OR LastName LIKE @Q OR NHSNumber LIKE @Q
                    ORDER BY LastName, FirstName`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Patient typeahead error:', err);
        res.status(500).json({ error: 'Failed to search patients.' });
    }
});

/* ================================================================
   DOCTORS
   ================================================================ */

// GET /api/doctors – list all (includes ConsultationFee)
app.get('/api/doctors', verifyToken, async (req, res) => {
    try {
        const pool   = await getPool();
        const result = await pool.request()
            .query(`SELECT d.DoctorID, d.Name, d.Specialisation, d.Phone, d.Email,
                           d.ConsultationFee,
                           dep.DepartmentID, dep.Name AS Department
                    FROM Doctor d
                    LEFT JOIN Department dep ON d.DepartmentID = dep.DepartmentID
                    ORDER BY d.Name`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Fetch doctors error:', err);
        res.status(500).json({ error: 'Failed to fetch doctors.' });
    }
});

// POST /api/doctors – admin: create doctor + auto-create system user
app.post('/api/doctors', verifyToken, authorise('Admin'), async (req, res) => {
    try {
        const { name, specialisation, phone, email, departmentId, consultationFee } = req.body;
        if (!name || !specialisation)
            return res.status(400).json({ error: 'Name and specialisation are required.' });

        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            const docResult = await transaction.request()
                .input('Name',           sql.VarChar,       name)
                .input('Specialisation', sql.VarChar,       specialisation)
                .input('Phone',          sql.VarChar,       phone || '')
                .input('Email',          sql.VarChar,       email || '')
                .input('DepartmentID',   sql.Int,           departmentId || null)
                .input('Fee',            sql.Decimal(10,2), consultationFee || 45.00)
                .query(`INSERT INTO Doctor (Name, Specialisation, Phone, Email, DepartmentID, ConsultationFee)
                        OUTPUT INSERTED.DoctorID
                        VALUES (@Name, @Specialisation, @Phone, @Email, @DepartmentID, @Fee)`);
            const doctorId = docResult.recordset[0].DoctorID;

            const nameParts = name.trim().toLowerCase().split(/\s+/);
            const username  = nameParts.length >= 2 ? `${nameParts[0]}.${nameParts[nameParts.length - 1]}` : nameParts[0];

            const existsResult = await transaction.request()
                .input('Username', sql.VarChar, username)
                .query('SELECT UserID FROM SystemUser WHERE Username = @Username');

            if (existsResult.recordset.length === 0) {
                await transaction.request()
                    .input('Username',     sql.VarChar, username)
                    .input('PasswordHash', sql.VarChar, 'password123')
                    .input('Role',         sql.VarChar, 'Doctor')
                    .input('DoctorID',     sql.Int,     doctorId)
                    .query(`INSERT INTO SystemUser (Username, PasswordHash, Role, DoctorID)
                            VALUES (@Username, @PasswordHash, @Role, @DoctorID)`);
            }
            await transaction.commit();
            res.status(201).json({ doctorId, username, message: `Doctor created. Login: ${username} / password123` });
        } catch (innerErr) { await transaction.rollback(); throw innerErr; }
    } catch (err) {
        console.error('Create doctor error:', err);
        res.status(500).json({ error: 'Failed to create doctor.' });
    }
});

/* ================================================================
   DEPARTMENTS
   ================================================================ */
app.get('/api/departments', verifyToken, async (req, res) => {
    try {
        const pool   = await getPool();
        const result = await pool.request().query('SELECT DepartmentID, Name, Location FROM Department ORDER BY Name');
        res.json(result.recordset);
    } catch (err) {
        console.error('Fetch departments error:', err);
        res.status(500).json({ error: 'Failed to fetch departments.' });
    }
});

/* ================================================================
   MEDICINES – helper list for dropdowns
   ================================================================ */
app.get('/api/medicines', verifyToken, async (req, res) => {
    try {
        const pool   = await getPool();
        const result = await pool.request()
            .query(`SELECT MedicineID, MedicineName, StockLevel, ReorderLevel, UnitPrice
                    FROM PharmacyInventory ORDER BY MedicineName`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Fetch medicines error:', err);
        res.status(500).json({ error: 'Failed to fetch medicines.' });
    }
});

/* ================================================================
   TEST PRICES – dropdown list
   ================================================================ */
app.get('/api/test-prices', verifyToken, async (req, res) => {
    try {
        const pool   = await getPool();
        const result = await pool.request()
            .query('SELECT TestPriceID, TestName, Price FROM TestPrice ORDER BY TestName');
        res.json(result.recordset);
    } catch (err) {
        console.error('Fetch test prices error:', err);
        res.status(500).json({ error: 'Failed to fetch test prices.' });
    }
});

/* ================================================================
   APPOINTMENTS
   ================================================================ */

// POST /api/appointments
app.post('/api/appointments', verifyToken, authorise('Receptionist', 'Admin'), async (req, res) => {
    try {
        const { patientId, doctorId, date, time, reasonForVisit } = req.body;
        if (!patientId || !doctorId || !date || !time)
            return res.status(400).json({ error: 'Patient, doctor, date, and time are required.' });

        const apptDate = new Date(date);
        const today    = new Date(); today.setHours(0,0,0,0);
        if (apptDate < today)
            return res.status(400).json({ error: 'Appointment date cannot be in the past.' });

        const pool = await getPool();

        const clash = await pool.request()
            .input('DoctorID', sql.Int,     doctorId)
            .input('Date',     sql.Date,    date)
            .input('Time',     sql.VarChar, time)
            .query(`SELECT AppointmentID FROM Appointment
                    WHERE DoctorID = @DoctorID AND Date = @Date AND Time = @Time AND Status != 'Cancelled'`);
        if (clash.recordset.length > 0)
            return res.status(409).json({ error: 'This doctor already has an appointment at the selected date and time.' });

        const result = await pool.request()
            .input('Date',           sql.Date,    date)
            .input('Time',           sql.VarChar, time)
            .input('Status',         sql.VarChar, 'Scheduled')
            .input('ReasonForVisit', sql.VarChar, reasonForVisit || null)
            .input('PatientID',      sql.Int,     patientId)
            .input('DoctorID',       sql.Int,     doctorId)
            .query(`INSERT INTO Appointment (Date, Time, Status, ReasonForVisit, PatientID, DoctorID)
                    OUTPUT INSERTED.AppointmentID
                    VALUES (@Date, @Time, @Status, @ReasonForVisit, @PatientID, @DoctorID)`);

        res.status(201).json({ appointmentId: result.recordset[0].AppointmentID, message: 'Appointment booked successfully.' });
    } catch (err) {
        console.error('Book appointment error:', err);
        res.status(500).json({ error: 'Failed to book appointment.' });
    }
});

// GET /api/appointments/today
app.get('/api/appointments/today', verifyToken, authorise('Doctor', 'Admin'), async (req, res) => {
    try {
        const doctorId = req.user.doctorId || req.query.doctorId;
        if (!doctorId) return res.status(400).json({ error: 'Doctor ID is required.' });

        const pool   = await getPool();
        const result = await pool.request()
            .input('DoctorID', sql.Int, doctorId)
            .query(`SELECT a.AppointmentID, a.Date, a.Time, a.Status, a.ReasonForVisit,
                           p.PatientID, p.FirstName + ' ' + p.LastName AS PatientName,
                           p.NHSNumber, p.DOB, p.Phone AS PatientPhone, p.Gender,
                           DATEDIFF(YEAR, p.DOB, GETDATE()) -
                               CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, p.DOB, GETDATE()), p.DOB) > GETDATE()
                                    THEN 1 ELSE 0 END AS PatientAge,
                           i.InvoiceID
                    FROM Appointment a
                    JOIN Patient p ON a.PatientID = p.PatientID
                    LEFT JOIN Invoice i ON a.AppointmentID = i.AppointmentID
                    WHERE a.DoctorID = @DoctorID AND a.Date = CAST(GETDATE() AS DATE)
                    ORDER BY a.Time`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Today appointments error:', err);
        res.status(500).json({ error: "Failed to fetch today's appointments." });
    }
});

// GET /api/appointments/all – for admin / receptionist
app.get('/api/appointments/all', verifyToken, authorise('Receptionist', 'Admin'), async (req, res) => {
    try {
        const pool   = await getPool();
        const result = await pool.request()
            .query(`SELECT TOP 100 a.AppointmentID, a.Date, a.Time, a.Status, a.ReasonForVisit,
                           p.FirstName + ' ' + p.LastName AS PatientName, p.NHSNumber,
                           d.Name AS DoctorName, d.Specialisation
                    FROM Appointment a
                    JOIN Patient p ON a.PatientID = p.PatientID
                    JOIN Doctor d  ON a.DoctorID  = d.DoctorID
                    ORDER BY a.Date DESC, a.Time DESC`);
        res.json(result.recordset);
    } catch (err) {
        console.error('All appointments error:', err);
        res.status(500).json({ error: 'Failed to fetch appointments.' });
    }
});

/* ================================================================
   HELPER: Ensure Invoice Exists (uses Doctor's real fee)
   ================================================================ */
async function ensureInvoice(transaction, appointmentId) {
    const existing = await transaction.request()
        .input('AppointmentID', sql.Int, appointmentId)
        .query('SELECT InvoiceID FROM Invoice WHERE AppointmentID = @AppointmentID');

    if (existing.recordset.length > 0) return existing.recordset[0].InvoiceID;

    // Look up the doctor's consultation fee for this appointment
    const feeResult = await transaction.request()
        .input('AppointmentID', sql.Int, appointmentId)
        .query(`SELECT d.ConsultationFee
                FROM Appointment a
                JOIN Doctor d ON a.DoctorID = d.DoctorID
                WHERE a.AppointmentID = @AppointmentID`);

    const fee = feeResult.recordset.length > 0 ? parseFloat(feeResult.recordset[0].ConsultationFee) : 45.00;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const invoiceResult = await transaction.request()
        .input('InvoiceDate',     sql.Date,          new Date())
        .input('DueDate',         sql.Date,          dueDate)
        .input('Amount',          sql.Decimal(10,2), fee)
        .input('PaymentStatus',   sql.VarChar,       'Pending')
        .input('ConsultationFee', sql.Decimal(10,2), fee)
        .input('AppointmentID',   sql.Int,           appointmentId)
        .query(`INSERT INTO Invoice (InvoiceDate, DueDate, Amount, PaymentStatus, ConsultationFee, AppointmentID)
                OUTPUT INSERTED.InvoiceID
                VALUES (@InvoiceDate, @DueDate, @Amount, @PaymentStatus, @ConsultationFee, @AppointmentID)`);

    const invoiceId = invoiceResult.recordset[0].InvoiceID;

    await transaction.request()
        .input('Description', sql.VarChar,       'Consultation Fee')
        .input('Quantity',    sql.Int,            1)
        .input('UnitPrice',   sql.Decimal(10,2),  fee)
        .input('LineTotal',   sql.Decimal(10,2),  fee)
        .input('InvoiceID',   sql.Int,            invoiceId)
        .query(`INSERT INTO InvoiceItem (Description, Quantity, UnitPrice, LineTotal, InvoiceID)
                VALUES (@Description, @Quantity, @UnitPrice, @LineTotal, @InvoiceID)`);

    return invoiceId;
}

async function recalcInvoiceAmount(transaction, invoiceId) {
    await transaction.request()
        .input('InvoiceID', sql.Int, invoiceId)
        .query(`UPDATE Invoice
                SET Amount = (SELECT ISNULL(SUM(LineTotal), 0) FROM InvoiceItem WHERE InvoiceID = @InvoiceID)
                WHERE InvoiceID = @InvoiceID`);
}

/* ================================================================
   PRESCRIPTIONS (multi-item via PrescriptionItem)
   ================================================================ */
app.post('/api/prescriptions', verifyToken, authorise('Doctor', 'Admin'), async (req, res) => {
    try {
        const { appointmentId, items } = req.body;
        if (!appointmentId || !items || !Array.isArray(items) || items.length === 0)
            return res.status(400).json({ error: 'Appointment ID and at least one medicine item are required.' });

        for (const item of items) {
            if (!item.medicineId || !item.quantity || !item.dosageInstructions)
                return res.status(400).json({ error: 'Each item must have medicineId, quantity, and dosageInstructions.' });
            if (item.quantity <= 0)
                return res.status(400).json({ error: 'Quantity must be greater than zero.' });
        }

        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            // Check stock for ALL items first
            for (const item of items) {
                const stock = await transaction.request()
                    .input('MedicineID', sql.Int, item.medicineId)
                    .query('SELECT StockLevel, MedicineName, UnitPrice FROM PharmacyInventory WHERE MedicineID = @MedicineID');
                if (stock.recordset.length === 0) throw { userError: `Medicine ID ${item.medicineId} not found.` };
                if (stock.recordset[0].StockLevel < item.quantity)
                    throw { userError: `Insufficient stock for ${stock.recordset[0].MedicineName}. Available: ${stock.recordset[0].StockLevel}, Requested: ${item.quantity}.` };
                item.medicineName = stock.recordset[0].MedicineName;
                item.unitPrice    = parseFloat(stock.recordset[0].UnitPrice);
            }

            // Create Prescription
            const rxResult = await transaction.request()
                .input('DateIssued',    sql.DateTime, new Date())
                .input('AppointmentID', sql.Int,      appointmentId)
                .query(`INSERT INTO Prescription (DateIssued, AppointmentID)
                        OUTPUT INSERTED.PrescriptionID
                        VALUES (@DateIssued, @AppointmentID)`);
            const prescriptionId = rxResult.recordset[0].PrescriptionID;

            // Insert each PrescriptionItem + deduct stock
            for (const item of items) {
                await transaction.request()
                    .input('PrescriptionID',     sql.Int,     prescriptionId)
                    .input('MedicineID',         sql.Int,     item.medicineId)
                    .input('Quantity',           sql.Int,     item.quantity)
                    .input('DosageInstructions', sql.VarChar, item.dosageInstructions)
                    .query(`INSERT INTO PrescriptionItem (PrescriptionID, MedicineID, Quantity, DosageInstructions)
                            VALUES (@PrescriptionID, @MedicineID, @Quantity, @DosageInstructions)`);
                await transaction.request()
                    .input('MedicineID', sql.Int, item.medicineId)
                    .input('Qty',        sql.Int, item.quantity)
                    .query('UPDATE PharmacyInventory SET StockLevel = StockLevel - @Qty WHERE MedicineID = @MedicineID');
            }

            // Ensure invoice + add medicine line items
            const invoiceId = await ensureInvoice(transaction, appointmentId);
            for (const item of items) {
                const lineTotal = item.unitPrice * item.quantity;
                await transaction.request()
                    .input('Description', sql.VarChar,       `Medicine: ${item.medicineName}`)
                    .input('Quantity',    sql.Int,            item.quantity)
                    .input('UnitPrice',   sql.Decimal(10,2),  item.unitPrice)
                    .input('LineTotal',   sql.Decimal(10,2),  lineTotal)
                    .input('InvoiceID',   sql.Int,            invoiceId)
                    .query(`INSERT INTO InvoiceItem (Description, Quantity, UnitPrice, LineTotal, InvoiceID)
                            VALUES (@Description, @Quantity, @UnitPrice, @LineTotal, @InvoiceID)`);
            }
            await recalcInvoiceAmount(transaction, invoiceId);

            await transaction.commit();
            res.status(201).json({ prescriptionId, invoiceId, message: 'Prescription issued, stock updated, invoice updated.' });
        } catch (innerErr) {
            await transaction.rollback();
            if (innerErr.userError) return res.status(409).json({ error: innerErr.userError });
            throw innerErr;
        }
    } catch (err) {
        console.error('Prescription error:', err);
        res.status(500).json({ error: 'Failed to issue prescription.' });
    }
});

// GET /api/prescriptions/appointment/:id
app.get('/api/prescriptions/appointment/:appointmentId', verifyToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('AppointmentID', sql.Int, parseInt(req.params.appointmentId, 10))
            .query(`SELECT p.PrescriptionID, p.DateIssued,
                           pi.PrescriptionItemID, pi.Quantity, pi.DosageInstructions,
                           m.MedicineName, m.UnitPrice
                    FROM Prescription p
                    JOIN PrescriptionItem pi ON p.PrescriptionID = pi.PrescriptionID
                    JOIN PharmacyInventory m ON pi.MedicineID = m.MedicineID
                    WHERE p.AppointmentID = @AppointmentID
                    ORDER BY p.PrescriptionID, pi.PrescriptionItemID`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Fetch prescriptions error:', err);
        res.status(500).json({ error: 'Failed to fetch prescriptions.' });
    }
});

/* ================================================================
   MEDICAL TESTS (now uses TestPriceID dropdown)
   ================================================================ */
app.post('/api/medical-tests', verifyToken, authorise('Doctor', 'Admin'), async (req, res) => {
    try {
        const { appointmentId, testPriceId } = req.body;
        if (!appointmentId || !testPriceId)
            return res.status(400).json({ error: 'Appointment ID and test selection are required.' });

        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            // Get test name and price from TestPrice table
            const tpResult = await transaction.request()
                .input('TestPriceID', sql.Int, testPriceId)
                .query('SELECT TestName, Price FROM TestPrice WHERE TestPriceID = @TestPriceID');
            if (tpResult.recordset.length === 0) throw { userError: 'Selected test not found.' };

            const testName  = tpResult.recordset[0].TestName;
            const testPrice = parseFloat(tpResult.recordset[0].Price);

            // Insert medical test record
            const testResult = await transaction.request()
                .input('TestName',      sql.VarChar, testName)
                .input('AppointmentID', sql.Int,     appointmentId)
                .input('TestPriceID',   sql.Int,     testPriceId)
                .query(`INSERT INTO MedicalTest (TestName, AppointmentID, TestPriceID)
                        OUTPUT INSERTED.TestID
                        VALUES (@TestName, @AppointmentID, @TestPriceID)`);
            const testId = testResult.recordset[0].TestID;

            // Ensure invoice + add test line item
            const invoiceId = await ensureInvoice(transaction, appointmentId);
            await transaction.request()
                .input('Description', sql.VarChar,       `Medical Test: ${testName}`)
                .input('Quantity',    sql.Int,            1)
                .input('UnitPrice',   sql.Decimal(10,2),  testPrice)
                .input('LineTotal',   sql.Decimal(10,2),  testPrice)
                .input('InvoiceID',   sql.Int,            invoiceId)
                .query(`INSERT INTO InvoiceItem (Description, Quantity, UnitPrice, LineTotal, InvoiceID)
                        VALUES (@Description, @Quantity, @UnitPrice, @LineTotal, @InvoiceID)`);
            await recalcInvoiceAmount(transaction, invoiceId);

            await transaction.commit();
            res.status(201).json({ testId, invoiceId, message: 'Medical test ordered and invoice updated.' });
        } catch (innerErr) {
            await transaction.rollback();
            if (innerErr.userError) return res.status(409).json({ error: innerErr.userError });
            throw innerErr;
        }
    } catch (err) {
        console.error('Medical test error:', err);
        res.status(500).json({ error: 'Failed to order medical test.' });
    }
});

// GET /api/medical-tests/appointment/:id
app.get('/api/medical-tests/appointment/:appointmentId', verifyToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('AppointmentID', sql.Int, parseInt(req.params.appointmentId, 10))
            .query(`SELECT mt.TestID, mt.TestName, mt.TestDate, mt.Result,
                           tp.Price
                    FROM MedicalTest mt
                    LEFT JOIN TestPrice tp ON mt.TestPriceID = tp.TestPriceID
                    WHERE mt.AppointmentID = @AppointmentID
                    ORDER BY mt.TestDate DESC`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Fetch tests error:', err);
        res.status(500).json({ error: 'Failed to fetch medical tests.' });
    }
});

/* ================================================================
   PATIENT REPORTS
   ================================================================ */

// POST /api/patient-reports
app.post('/api/patient-reports', verifyToken, authorise('Doctor', 'Admin'), async (req, res) => {
    try {
        const { appointmentId, diagnosis, treatmentPlan } = req.body;
        if (!appointmentId || !diagnosis || !treatmentPlan)
            return res.status(400).json({ error: 'Appointment ID, diagnosis, and treatment plan are required.' });

        const pool = await getPool();

        // Check if report already exists for this appointment
        const exists = await pool.request()
            .input('AppointmentID', sql.Int, appointmentId)
            .query('SELECT ReportID FROM PatientReport WHERE AppointmentID = @AppointmentID');
        if (exists.recordset.length > 0)
            return res.status(409).json({ error: 'A report already exists for this appointment. Use PUT to update.' });

        const result = await pool.request()
            .input('AppointmentID', sql.Int,     appointmentId)
            .input('Diagnosis',     sql.VarChar, diagnosis)
            .input('TreatmentPlan', sql.VarChar, treatmentPlan)
            .query(`INSERT INTO PatientReport (AppointmentID, Diagnosis, TreatmentPlan)
                    OUTPUT INSERTED.ReportID
                    VALUES (@AppointmentID, @Diagnosis, @TreatmentPlan)`);

        // Also mark appointment as Completed
        await pool.request()
            .input('AppointmentID', sql.Int, appointmentId)
            .query("UPDATE Appointment SET Status = 'Completed' WHERE AppointmentID = @AppointmentID");

        res.status(201).json({ reportId: result.recordset[0].ReportID, message: 'Patient report saved and appointment completed.' });
    } catch (err) {
        console.error('Create report error:', err);
        res.status(500).json({ error: 'Failed to save patient report.' });
    }
});

// GET /api/patient-reports/appointment/:id
app.get('/api/patient-reports/appointment/:appointmentId', verifyToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('AppointmentID', sql.Int, parseInt(req.params.appointmentId, 10))
            .query(`SELECT r.ReportID, r.Diagnosis, r.TreatmentPlan, r.GeneratedDate,
                           p.FirstName + ' ' + p.LastName AS PatientName, p.NHSNumber, p.DOB, p.Gender,
                           d.Name AS DoctorName, d.Specialisation,
                           a.Date AS AppointmentDate, a.ReasonForVisit
                    FROM PatientReport r
                    JOIN Appointment a ON r.AppointmentID = a.AppointmentID
                    JOIN Patient p ON a.PatientID = p.PatientID
                    JOIN Doctor d ON a.DoctorID = d.DoctorID
                    WHERE r.AppointmentID = @AppointmentID`);
        if (result.recordset.length === 0)
            return res.status(404).json({ error: 'No report found for this appointment.' });
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Fetch report error:', err);
        res.status(500).json({ error: 'Failed to fetch patient report.' });
    }
});

/* ================================================================
   PHARMACY
   ================================================================ */
app.get('/api/pharmacy', verifyToken, async (req, res) => {
    try {
        const pool   = await getPool();
        const result = await pool.request()
            .query(`SELECT MedicineID, MedicineName, StockLevel, ReorderLevel, UnitPrice
                    FROM PharmacyInventory ORDER BY MedicineName`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Pharmacy fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch pharmacy inventory.' });
    }
});

/* ================================================================
   INVOICES
   ================================================================ */

// GET /api/invoices/unpaid
app.get('/api/invoices/unpaid', verifyToken, authorise('BillingClerk', 'Admin'), async (req, res) => {
    try {
        const pool   = await getPool();
        const result = await pool.request()
            .query(`SELECT i.InvoiceID, i.InvoiceDate, i.DueDate, i.Amount, i.PaymentStatus,
                           i.ConsultationFee,
                           p.FirstName + ' ' + p.LastName AS PatientName,
                           DATEDIFF(DAY, i.DueDate, GETDATE()) AS DaysOverdue
                    FROM Invoice i
                    JOIN Appointment a ON i.AppointmentID = a.AppointmentID
                    JOIN Patient p     ON a.PatientID     = p.PatientID
                    WHERE i.PaymentStatus = 'Pending'
                    ORDER BY i.DueDate ASC`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Unpaid invoices error:', err);
        res.status(500).json({ error: 'Failed to fetch unpaid invoices.' });
    }
});

// GET /api/invoices/:id – full invoice with line items
app.get('/api/invoices/:id', verifyToken, async (req, res) => {
    try {
        const invoiceId = parseInt(req.params.id, 10);
        const pool = await getPool();

        const invResult = await pool.request()
            .input('InvoiceID', sql.Int, invoiceId)
            .query(`SELECT i.InvoiceID, i.InvoiceDate, i.DueDate, i.Amount, i.PaymentStatus,
                           i.ConsultationFee, i.PaidDate,
                           p.FirstName + ' ' + p.LastName AS PatientName,
                           p.NHSNumber, p.Address, p.Phone AS PatientPhone,
                           d.Name AS DoctorName, d.Specialisation
                    FROM Invoice i
                    JOIN Appointment a ON i.AppointmentID = a.AppointmentID
                    JOIN Patient p     ON a.PatientID     = p.PatientID
                    JOIN Doctor d      ON a.DoctorID      = d.DoctorID
                    WHERE i.InvoiceID = @InvoiceID`);
        if (invResult.recordset.length === 0)
            return res.status(404).json({ error: 'Invoice not found.' });

        const itemsResult = await pool.request()
            .input('InvoiceID', sql.Int, invoiceId)
            .query(`SELECT InvoiceItemID, Description, Quantity, UnitPrice, LineTotal
                    FROM InvoiceItem WHERE InvoiceID = @InvoiceID ORDER BY InvoiceItemID`);

        res.json({ ...invResult.recordset[0], items: itemsResult.recordset });
    } catch (err) {
        console.error('Invoice detail error:', err);
        res.status(500).json({ error: 'Failed to fetch invoice details.' });
    }
});

// PUT /api/invoices/:id/pay
app.put('/api/invoices/:id/pay', verifyToken, authorise('BillingClerk', 'Admin'), async (req, res) => {
    try {
        const pool   = await getPool();
        const result = await pool.request()
            .input('InvoiceID', sql.Int, parseInt(req.params.id, 10))
            .query(`UPDATE Invoice SET PaymentStatus = 'Paid', PaidDate = CAST(GETDATE() AS DATE)
                    WHERE InvoiceID = @InvoiceID AND PaymentStatus = 'Pending'`);
        if (result.rowsAffected[0] === 0)
            return res.status(404).json({ error: 'Invoice not found or already paid.' });
        res.json({ message: 'Invoice marked as paid.' });
    } catch (err) {
        console.error('Pay invoice error:', err);
        res.status(500).json({ error: 'Failed to update invoice.' });
    }
});

/* ================================================================
   REPORTS
   ================================================================ */

app.get('/api/reports/monthly-billing', verifyToken, authorise('Admin', 'BillingClerk'), async (req, res) => {
    try {
        const pool   = await getPool();
        const result = await pool.request()
            .query(`SELECT YEAR(InvoiceDate) AS Year, MONTH(InvoiceDate) AS Month,
                           COUNT(*) AS TotalInvoices,
                           SUM(CASE WHEN PaymentStatus = 'Paid'    THEN Amount ELSE 0 END) AS PaidAmount,
                           SUM(CASE WHEN PaymentStatus = 'Pending' THEN Amount ELSE 0 END) AS PendingAmount,
                           SUM(Amount) AS TotalAmount
                    FROM Invoice
                    GROUP BY YEAR(InvoiceDate), MONTH(InvoiceDate)
                    ORDER BY Year DESC, Month DESC`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Monthly billing error:', err);
        res.status(500).json({ error: 'Failed to generate monthly billing report.' });
    }
});

app.get('/api/reports/doctor-patient-count', verifyToken, authorise('Admin'), async (req, res) => {
    try {
        const pool   = await getPool();
        const result = await pool.request()
            .query(`SELECT d.Name AS DoctorName, d.Specialisation,
                           COUNT(DISTINCT a.PatientID) AS UniquePatients,
                           COUNT(a.AppointmentID) AS TotalAppointments
                    FROM Doctor d LEFT JOIN Appointment a ON d.DoctorID = a.DoctorID
                    GROUP BY d.Name, d.Specialisation
                    ORDER BY TotalAppointments DESC`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Doctor-patient count error:', err);
        res.status(500).json({ error: 'Failed to generate doctor-patient report.' });
    }
});

app.get('/api/reports/low-stock', verifyToken, authorise('Admin', 'BillingClerk'), async (req, res) => {
    try {
        const pool   = await getPool();
        const result = await pool.request()
            .query(`SELECT MedicineID, MedicineName, StockLevel, ReorderLevel, UnitPrice
                    FROM PharmacyInventory WHERE StockLevel <= ReorderLevel ORDER BY StockLevel ASC`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Low stock error:', err);
        res.status(500).json({ error: 'Failed to fetch low-stock medicines.' });
    }
});

/* ================================================================
   SYSTEM USERS (Admin)
   ================================================================ */
app.get('/api/users', verifyToken, authorise('Admin'), async (req, res) => {
    try {
        const pool   = await getPool();
        const result = await pool.request()
            .query(`SELECT u.UserID, u.Username, u.Role, u.DoctorID, u.CreatedAt,
                           d.Name AS DoctorName
                    FROM SystemUser u
                    LEFT JOIN Doctor d ON u.DoctorID = d.DoctorID
                    ORDER BY u.UserID`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Fetch users error:', err);
        res.status(500).json({ error: 'Failed to fetch system users.' });
    }
});

app.post('/api/users', verifyToken, authorise('Admin'), async (req, res) => {
    try {
        const { username, password, role, doctorId } = req.body;
        if (!username || !password || !role)
            return res.status(400).json({ error: 'Username, password, and role are required.' });

        const validRoles = ['Receptionist', 'Doctor', 'BillingClerk', 'Admin'];
        if (!validRoles.includes(role))
            return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}.` });

        const pool = await getPool();
        const exists = await pool.request()
            .input('Username', sql.VarChar, username)
            .query('SELECT UserID FROM SystemUser WHERE Username = @Username');
        if (exists.recordset.length > 0)
            return res.status(409).json({ error: 'Username already exists.' });

        await pool.request()
            .input('Username',     sql.VarChar, username)
            .input('PasswordHash', sql.VarChar, password)
            .input('Role',         sql.VarChar, role)
            .input('DoctorID',     sql.Int,     doctorId || null)
            .query(`INSERT INTO SystemUser (Username, PasswordHash, Role, DoctorID)
                    VALUES (@Username, @PasswordHash, @Role, @DoctorID)`);

        res.status(201).json({ message: 'User created successfully.' });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Failed to create user.' });
    }
});

/* ── Catch-all: serve index.html ────────────────────────────────── */
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ── Start server ───────────────────────────────────────────────── */
app.listen(PORT, () => {
    console.log(`\n🏥  LifeCare HMS running at  http://localhost:${PORT}\n`);
});
