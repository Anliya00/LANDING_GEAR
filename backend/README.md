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
