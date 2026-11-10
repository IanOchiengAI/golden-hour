# Golden Hour backend (Django + DRF)

Owner: Roland Sankara.

## Run it

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows; on macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

python scripts/build_starter_db.py   # once: builds blood_system.sqlite from the CSVs (see below)
python manage.py migrate
python manage.py seed_demo_users     # demo users, password demo2026 (or $DEMO_PASSWORD)
python manage.py runserver 8000
```

Tests: `python manage.py test`

## Two databases

| Database | File | Access | Holds |
|---|---|---|---|
| Starter data | `Terumo BCT Hackathon - Applicant_s Kit/Starter Dataset/blood_system.sqlite` | **read-only** (`emergency/stock.py`) | facilities, routes, units, donations … |
| App data | `backend/app.sqlite3` | Django ORM | users, requests, ranked options, unit holds, audit log |

`blood_system.sqlite` was committed to the repo as an empty (0-byte) file.
`scripts/build_starter_db.py` rebuilds it from the provided CSVs, the same way the
kit's `gen.py` does (`pandas.to_sql`). **Do not commit the rebuilt file** (~100 MB);
leave it unstaged. `ml/predict.py` reads routes from the same path.

## Settings (environment variables)

| Variable | Default | Notes |
|---|---|---|
| `DJANGO_SECRET_KEY` | dev key when `DEBUG` | required in production |
| `DJANGO_DEBUG` | `1` | set `0` when deployed (turns on HTTPS hardening) |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | comma-separated |
| `COUNTRY_CONFIG` | `config/kenya.yaml` | country rules file |
| `STARTER_DB_PATH`, `APP_DB_PATH` | see above | |
| `LOGIN_THROTTLE_RATE` | `10/min` | rate limit on `/auth/login` |

## Auth

`POST /auth/login {username, password}` → `{token, role, facility_id}`.
Send `Authorization: Token <token>` on every other call. Each endpoint checks the
caller's role; refused calls and every login attempt are written to the audit log.
