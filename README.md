# 🏥 LifeCare Hospital Management System (HMS)

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Microsoft SQL Server](https://img.shields.io/badge/Database-SQL%20Server-CC292B?logo=microsoftsqlserver&logoColor=white)](https://www.microsoft.com/sql-server)
[![JWT](https://img.shields.io/badge/Auth-JWT-000000?logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A robust, enterprise-grade Hospital Management System web application designed to streamline patient intake, clinical consultations, pharmacy inventory, and medical billing. Built with a **Node.js/Express** backend, **Microsoft SQL Server**, and an interactive, responsive single-page frontend.

---

## 🌟 Key Features

### 🩺 Doctor Workspace
- **Consultation Queue**: Real-time listing of assigned patient appointments.
- **Electronic Health Records**: Review patient visit history, medical summaries, and recorded diagnoses.
- **Prescription Issuance**: Generate multi-item prescriptions with automatic stock validation and immediate inventory deduction.
- **Diagnostic Orders**: Order medical tests (Full Blood Count, MRI, CT Scan, X-Ray, ECG, etc.) mapped to standardized hospital price schedules.

### 📋 Receptionist Desk
- **Patient Registration**: Register new patients with automated NHS number validation (`### ### ####` format) and demographic records.
- **Patient Search & Directory**: Instant search across patient database by name or NHS number.
- **Smart Appointment Scheduling**: Book appointments across departments and specialists with real-time double-booking prevention.

### 💳 Billing & Cashier Department
- **Automated Invoice Generation**: Invoices compiled automatically from consultation fees, issued prescriptions, and diagnostic lab orders.
- **Payment Processing**: Track pending vs. paid accounts, monitor days overdue, and issue payment clearances.
- **Pharmacy & Inventory Monitoring**: Track real-time pharmaceutical inventory and receive low-stock alerts.

### 🛡️ Administrative Oversight
- **Role-Based Access Control (RBAC)**: Secure access policies enforced across Doctors, Receptionists, Billing Clerks, and Administrators using JSON Web Tokens (JWT).
- **Audit Reports & Analytics**: Monthly billing breakdowns, doctor patient load distribution, and department analytics.

---

## 🔐 Demo Credentials

> 🔒 **Security Notice**: To protect live deployments and production data, the primary Administrator (`admin.chris`) credentials are withheld from public documentation. Please use the following role-based demo accounts to explore the application:

| Role | Username | Password | Access Capabilities |
| :--- | :--- | :--- | :--- |
| **Doctor** (Cardiology) | `dr.sarah.jones` | `password123` | Patient consults, test orders, prescriptions |
| **Doctor** (Cardiology) | `dr.michael.chen` | `password123` | Clinical records, diagnostics, patient care |
| **Doctor** (General Med) | `dr.emma.clarke` | `password123` | Consultations, treatment plans, prescriptions |
| **Receptionist** | `reception.elsa` | `password123` | Patient registration, scheduling, booking |
| **Receptionist** | `reception.tom` | `password123` | Front desk workflows, appointment management |
| **Billing Clerk** | `billing.natalie` | `password123` | Invoicing, payment reconciliations, stock monitoring |
| **Billing Clerk** | `billing.sarah` | `password123` | Invoicing, accounts receivable |

---

## 📁 Repository Structure

```
lifecare-hospital-management/
├── public/                 # Static frontend assets
│   └── index.html          # Responsive single-page interface (UI, CSS, Client JS)
├── auth.js                 # JWT verification & role authorization middleware
├── db.js                   # Microsoft SQL Server connection pool management
├── server.js               # Express REST API endpoints & business logic
├── schema_update.sql       # Database schema extensions & seed configurations
├── test-db.js              # Diagnostic script for database connectivity & verification
├── .env.example            # Sample configuration file for environment variables
├── package.json            # Project dependencies and script declarations
└── README.md               # Project documentation
```

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (version 18.x or higher recommended)
- [Microsoft SQL Server](https://www.microsoft.com/sql-server) (SQL Server Express or Developer Edition)
- ODBC Driver 17 for SQL Server

### 2. Clone the Repository
```bash
git clone https://github.com/umaircodecores/lifecare-hospital-management.git
cd lifecare-hospital-management
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Setup
1. Open SQL Server Management Studio (SSMS) or Azure Data Studio.
2. Create a database named `LifeCareDB`.
3. Execute the project database setup and `schema_update.sql` to initialize tables, stored procedures (`sp_Login`), and default seed records.
4. Verify connectivity anytime by running:
   ```bash
   node test-db.js
   ```

### 5. Environment Configuration
Create a `.env` file in the root directory by copying `.env.example`:
```bash
cp .env.example .env
```
Update the settings inside `.env` to match your environment:
```env
PORT=3000
JWT_SECRET=YourSuperSecretKeyHere
DB_SERVER=localhost
DB_NAME=LifeCareDB
```

### 6. Run the Application
```bash
npm start
```
Open your browser and navigate to:
```
http://localhost:3000
```

---

## 🌐 Deployment Notes

- **Cloud Deployment**: When deploying to platforms such as Vercel, Render, or Railway, set your environment variables (`PORT`, `JWT_SECRET`, `DB_SERVER`, `DB_NAME`, etc.) in the respective platform's environment settings dashboard.
- Ensure your SQL Server instance is reachable from your hosting provider's network or configured with proper firewall whitelist rules.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
