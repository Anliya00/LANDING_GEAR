# SFTAD — Smart Flight Test Analytics Dashboard
### Landing Gear Data Management System

SFTAD is an end-to-end flight test data management and analytics platform engineered for aircraft landing gear systems. It ingests high-frequency flight test telemetry, converts raw recordings into optimized columnar Parquet datasets, computes 26 critical engineering parameters across 6 parameter families, and visualizes time-series signals and trend metrics via an interactive web dashboard.

> **Detailed Technical Reference**: For mathematical formulas, event detection state machines, limits, and developer implementation details, see the **[Workflow & Computation Guide](file:///d:/Projects/ARDC2/LandingGearDataManagement/sftad/WORKFLOW_AND_COMPUTATION_GUIDE.md)**.

---

## Architecture Overview

The system consists of three main tiers:

```
┌────────────────────────────────────────────────────────┐
│                   Frontend (React + Vite)              │
│  - Interactive Plotly.js time-series & signal plots    │
│  - Flight KPI grids, summary cards, and PDF reporting  │
│  - Role-based views: Admin, Engineer, Analyst, Viewer  │
└───────────────────────────▲────────────────────────────┘
                            │ HTTP (Cookie-based auth)
┌───────────────────────────▼────────────────────────────┐
│                  Backend (FastAPI)                     │
│  - RESTful APIs for Auth, Flights, Ingestion, Analysis │
│  - Ingestion Worker: Parquet conversion from Excel     │
│  - Analysis Worker: Event detection & parameter math   │
└───────────────────────────▲────────────────────────────┘
                            │ python-oracledb (thin mode)
┌───────────────────────────▼────────────────────────────┐
│                   Oracle Database                      │
│  - Schema: Users, Roles, Sessions, Aircrafts, Flights  │
│  - Events, Parameter Definitions & Computed Results    │
└────────────────────────────────────────────────────────┘
```

- **Frontend**: React 18, TypeScript, Vite, Plotly.js, Lucide Icons, jsPDF.
- **Backend**: FastAPI (Python 3.11+), Polars, PyArrow, Pandas, Argon2-cffi.
- **Database**: Oracle Database (19c/21c/XE) connected via `python-oracledb` in thin mode (no Oracle Instant Client required).
- **Background Workers**:
  - **Ingestion Worker**: Watches flight directories and converts raw Excel flight recordings into partitioned Parquet files.
  - **Analysis Worker**: Automatically detects flight phases/events (e.g., touchdown, gear downlock) and computes mechanical, structural, and thermodynamic landing gear parameters.

---

## Directory Structure

```text
sftad/
├── backend/                  # FastAPI backend service
│   ├── app/                  # Application source code
│   │   ├── api/              # REST API endpoints (auth, flights, analysis, users)
│   │   ├── compute/          # Parameter computation engines (6 families)
│   │   ├── db/               # Database connection pool & repositories
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── security/         # Argon2 password hashing & session management
│   │   └── services/         # Ingestion & analysis background workers
│   ├── migrations/           # SQL schema DDL and migrations
│   ├── scripts/              # Administrative & DB verification CLI tools
│   ├── .env.example          # Backend configuration template
│   └── pyproject.toml        # Python dependencies and package metadata
├── frontend/                 # React + TypeScript frontend
│   ├── src/                  # Source code (pages, components, charts, auth)
│   ├── package.json          # Node dependencies and scripts
│   └── vite.config.ts        # Vite configuration & dev server proxy
├── data/                     # Raw telemetry and converted Parquet files
│   └── Aircrafts/            # Flight records organized by Aircraft ID
├── docs/                     # Architecture Decision Records (ADRs)
└── README.md                 # Project documentation
```

---

## Prerequisites

Ensure you have the following installed on your system:

1. **Python 3.11+** (`python --version`)
2. **Node.js 18+ & npm** (`node --version`, `npm --version`)
3. **Oracle Database 19c, 21c, or 21c XE**
   - Active Oracle Listener service running on port 1521.
   - An existing schema or pluggable database (PDB) with appropriate table creation privileges.

---

## Setup Guide

### Step 1: Database Setup

1. Open your Oracle SQL client (SQL*Plus, SQL Developer, or DBeaver) connected to your target PDB/service.
2. Run the migration scripts in order:

```sql
-- 1. Create authentication, roles, users, and session tables
@backend/migrations/001_auth.sql

-- 2. Create engineering parameters, events, and results tables
@backend/migrations/002_compute.sql
```

---

### Step 2: Backend Setup

1. Open a terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   - **Windows (PowerShell / Command Prompt)**:
     ```powershell
     python -m venv .venv
     .venv\Scripts\activate
     ```
   - **Linux / macOS**:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. Install backend dependencies in editable mode:
   ```bash
   pip install -e .
   ```

4. Create your `.env` configuration file from the template:
   - **Windows**:
     ```powershell
     Copy-Item .env.example .env
     ```
   - **Linux / macOS**:
     ```bash
     cp .env.example .env
     ```

5. Edit `backend/.env` with your actual database details:
   ```env
   # Oracle Database Configuration
   ORACLE_USER=sftad_user
   ORACLE_PASSWORD=YourPasswordHere
   ORACLE_DSN=localhost:1521/XEPDB1
   ORACLE_POOL_MIN=1
   ORACLE_POOL_MAX=8

   # Session Security (Set to false on plain HTTP localhost)
   SESSION_COOKIE_NAME=sftad_session
   SESSION_COOKIE_SECURE=false
   SESSION_IDLE_HOURS=12
   SESSION_REMEMBER_HOURS=336

   # Security & Lockout
   MAX_FAILED_ATTEMPTS=8
   LOCKOUT_MINUTES=15

   # Storage Path
   DATA_DIR=../data

   # CORS (Frontend URL)
   CORS_ORIGINS=http://localhost:5173

   # Parameter Computation Pipeline
   COMPUTE_FAMILIES=retraction,extension,mass,sink_rate,landing_roll,load_factor
   RESULTS_LINK_MODE=id
   ```

6. Seed the parameter definitions and master events:
   ```bash
   python -m scripts.seed_reference
   ```

7. Verify that your database schema matches the backend code:
   ```bash
   python -m scripts.check_db
   ```

8. Create your initial administrator account:
   ```bash
   python -m scripts.create_admin --username admin --name "System Administrator"
   ```
   > **Note:** A secure temporary password will be displayed in the terminal. Copy it to sign in for the first time.

---

### Step 3: Frontend Setup

1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```

2. Install Node.js packages:
   ```bash
   npm install
   ```

---

## Running the Application

### 1. Start the Backend API & Background Workers

In your backend terminal (with `.venv` activated):
```bash
uvicorn app.main:app --reload --port 8000


uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- **API Base URL**: `http://localhost:8000`
- **Interactive OpenAPI Documentation (Swagger)**: `http://localhost:8000/docs`
- **Health Check Endpoint**: `http://localhost:8000/health`

### 2. Start the Frontend Development Server

In your frontend terminal:
```bash
npm run dev
```

- **Web Application URL**: `http://localhost:5173`

Open `http://localhost:5173` in your browser and sign in using the administrator credentials created in Step 2.8.

---

## Engineering Parameter Computation

SFTAD automatically computes 26 landing gear parameters divided into six families:

| Family | Key Parameters |
| :--- | :--- |
| **Retraction** | Gear retraction cycle time, transition sequencing, peak hydraulic actuation pressure |
| **Extension** | Freefall/extension duration, downlock confirmation times, pressure recovery |
| **Mass** | Takeoff gross weight, fuel burn burn-down, landing mass estimation |
| **Sink Rate** | Touchdown vertical velocity, radio altimeter descent rates, main gear ground contact timestamps |
| **Landing Roll** | Ground deceleration rate, rollout distance, braking actuation response |
| **Load Factor** | Peak vertical $N_z$ acceleration at touchdown, structural shock absorber response |

### Running Computation from CLI

You can execute parameter analysis directly without the UI:

```bash
# 1. Preview parameter detection from raw Parquet signals without database inserts:
python -m scripts.run_compute --detect-only --derived ../data/Aircrafts/AC2/AC2_001_10072026/Derived

# 2. Dry run against Oracle (executes all validation & queries, then safely rolls back):
python -m scripts.run_compute --flight-id 1 --dry-run

# 3. Commit analysis results for a specific flight:
python -m scripts.run_compute --flight-id 1
```

---

## Troubleshooting

### 1. `DPY-6005: cannot connect to database` / `[WinError 10061]`
- **Cause**: The backend cannot establish a TCP connection to the Oracle port `1521`.
- **Solution**:
  - Verify Oracle TNS Listener is running: `lsnrctl status` (start via `lsnrctl start` or Windows Service `OracleOraDB...TNSListener`).
  - Verify Oracle Service is started (e.g., `OracleServiceXE`).
  - Check the `ORACLE_DSN` in `backend/.env`. If running locally, ensure it is set to `localhost:1521/<service_or_pdb_name>`.

### 2. Sign-in does not persist / Cookie dropped
- **Cause**: Browsers reject insecure cookies on plain HTTP if secure flags are mismatched.
- **Solution**: Ensure `SESSION_COOKIE_SECURE=false` in `backend/.env` during local development over `http://`.

### 3. CORS Error on API requests
- **Cause**: Frontend origin not recognized by FastAPI CORS middleware.
- **Solution**: Confirm that `CORS_ORIGINS` in `backend/.env` exactly matches your frontend port (e.g. `http://localhost:5173`).