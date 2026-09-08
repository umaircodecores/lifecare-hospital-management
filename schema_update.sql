USE LifeCareDB;
GO

-- 1. Add ConsultationFee to Doctor
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Doctor') AND name = 'ConsultationFee')
BEGIN
    ALTER TABLE Doctor ADD ConsultationFee DECIMAL(10,2) NOT NULL DEFAULT 45.00;
END
GO

UPDATE Doctor SET ConsultationFee = 100.00 WHERE Specialisation = 'Cardiology';
UPDATE Doctor SET ConsultationFee = 120.00 WHERE Specialisation = 'Neurology';
UPDATE Doctor SET ConsultationFee = 150.00 WHERE Specialisation = 'Oncology';
UPDATE Doctor SET ConsultationFee = 80.00  WHERE Specialisation = 'Orthopaedics';
UPDATE Doctor SET ConsultationFee = 75.00  WHERE Specialisation = 'Paediatrics';
UPDATE Doctor SET ConsultationFee = 90.00  WHERE Specialisation IN ('Obstetrics & Gynaecology');
UPDATE Doctor SET ConsultationFee = 65.00  WHERE Specialisation = 'Emergency Medicine';
UPDATE Doctor SET ConsultationFee = 55.00  WHERE Specialisation = 'Radiology';
UPDATE Doctor SET ConsultationFee = 50.00  WHERE Specialisation = 'Clinical Pharmacy';
UPDATE Doctor SET ConsultationFee = 45.00  WHERE Specialisation = 'General Practice';
GO

-- 2. Create PatientReport table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'PatientReport' AND xtype = 'U')
BEGIN
    CREATE TABLE PatientReport (
        ReportID INT IDENTITY(1,1) PRIMARY KEY,
        AppointmentID INT NOT NULL UNIQUE,
        Diagnosis VARCHAR(500) NOT NULL,
        TreatmentPlan VARCHAR(1000) NOT NULL,
        GeneratedDate DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_PatientReport_Appointment FOREIGN KEY (AppointmentID) REFERENCES Appointment(AppointmentID)
    );
END
GO

-- 3. Add TestPriceID FK to MedicalTest (keep TestName for display)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('MedicalTest') AND name = 'TestPriceID')
BEGIN
    ALTER TABLE MedicalTest ADD TestPriceID INT NULL;
    ALTER TABLE MedicalTest ADD CONSTRAINT FK_MedicalTest_TestPrice FOREIGN KEY (TestPriceID) REFERENCES TestPrice(TestPriceID);
END
GO

-- Verify
SELECT 'Doctor.ConsultationFee' AS Feature, Name, ConsultationFee FROM Doctor;
SELECT 'PatientReport' AS Feature, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PatientReport';
SELECT 'MedicalTest.TestPriceID' AS Feature, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MedicalTest' AND COLUMN_NAME = 'TestPriceID';
