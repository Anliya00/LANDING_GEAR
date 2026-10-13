# SFTAD backend

FastAPI + python-oracledb (thin mode — no Oracle Instant Client needed).

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e .
```

## Configure

```bash
cp .env.example .env
```

Fill in `ORACLE_USER`, `ORACLE_PASSWORD` and `ORACLE_DSN`. The DSN is
`host:port/service_name`, for example `10.0.0.12:1521/SFTADPDB`.

`.env` is gitignored and is the only file holding credentials.

## Create the tables

Run the migration as the SFTAD schema owner:

```bash
sqlplus sftad/password@host:1521/service @migrations/001_auth.sql
```

Or paste its contents into SQL Developer. It creates ROLES, USERS, USER_ROLES
and SESSIONS, and seeds the four roles. The six D1 tables are untouched.

## Create the first administrator

```bash
python -m scripts.create_admin --username yourname --name "Your Name"
```

The password is generated and printed once. The account is flagged to change
it at first sign-in. There is no default password in the source.

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

API docs at http://localhost:8000/docs, health at `/health`.

## Notes

- `SESSION_COOKIE_SECURE` must be `false` on plain HTTP, otherwise the browser
  drops the cookie and sign-in appears to do nothing. Set it to `true` once
  HTTPS is in front of the application.
- `CORS_ORIGINS` must name the frontend origin exactly. It cannot be `*`,
  because browsers refuse to send cookies to a wildcard origin.

## Engineering parameter computation

26 parameters across six families, per `docs/decisions/0002-engineering-parameters.md`.
Analysis runs as its own background task alongside the ingestion worker, so a long
computation never delays the next upload.

### Setting it up

```bash
pip install -e .                       # polars is a new dependency
sqlplus sftad/password@host:1521/service @migrations/002_compute.sql
python -m scripts.seed_reference       # EVENTS and PARAMETERS master rows
python -m scripts.check_db             # verifies the schema against the code
```

`002_compute.sql` adds four tables and leaves AIRCRAFTS, FLIGHTS and FLIGHT_STATUS
alone apart from one optional column. Read it before running it — `check_db` reports
which parts you actually need.

### Running one flight by hand

```bash
# no database at all: read the Parquet, print every value
python -m scripts.run_compute --detect-only --derived ../data/AC2/AC2_001_10072026/Derived

# real inserts against Oracle, then rolled back
python -m scripts.run_compute --flight-id 1 --dry-run

# commits
python -m scripts.run_compute --flight-id 1

# verify what landed
python -m scripts.check_db --flight-id 1
```

`--dry-run` is not a simulation. It executes every INSERT — id allocation, bind types,
foreign keys, column types — and then rolls back, so a clean run proves the write path.

### Triggering analysis

Writing the status is the enqueue; there is no broker.

```
POST /flights/{id}/analysis     -> 202, sets ANALYSIS PENDING
GET  /flights/{id}/analysis     -> current status
```

The analysis worker polls every 5 seconds, claims one flight with
`FOR UPDATE ... SKIP LOCKED`, and moves it through ANALYZING to ANALYSIS COMPLETE or
ANALYSIS FAILED, with the reason in `FLIGHT_STATUS.REMARKS`.

### Adding a parameter family

1. Write `app/compute/families/<name>.py` exposing `FAMILY`, `EVENT_KEYS`,
   `PARAM_NAMES`, `SOURCE_FILES`, `NEEDS_PHASES`, `PARAM_DEFINITIONS` and
   `compute(signals, context, phases) -> FamilyOutput`.
2. Add it to `_MODULES` in `app/compute/registry.py`.
3. Re-run `python -m scripts.seed_reference`.

Nothing else changes — the worker, the API and the CLI all read the registry.

### Notes

- `COMPUTE_FAMILIES` in `.env` sets which families run, and in what order.
- `RESULTS_LINK_MODE` must match the real type of `RESULTS.START_EVENT_TIMESTAMP`:
  `id` for NUMBER, `timestamp` for TIMESTAMP. `check_db` reads the column and tells
  you which. Getting it wrong is an ORA-00932 on the first insert, not silent
  corruption.
- Three tuning constants are not in the requirements and are flagged in the source:
  `phases.CLIMB_PEAK_RATIO`, `phases.LANDING_MIN_PEAK_MS` and `mass.MAX_FUEL_GAP_S`.
  See decision 0002 for what each prevents and the measurements behind it.
