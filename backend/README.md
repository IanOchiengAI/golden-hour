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

## Endpoints built so far

### `POST /requests` — clinician
The requesting facility is the clinician's own (from their profile). Matching,
ML ranking and the auto-hold of the top site's units all happen here.

```json
{"patient_blood_group": "O+ | … | unknown", "component": "RBC | PLT | FFP",
 "units_requested": 2, "urgency": "life_threatening | urgent | routine",
 "clinical_note": "optional, ≤500 chars"}
```
→ `201` with the request: `id, status ("AwaitingDecision" or "HandledManually"),
compatible_groups, warnings, eta_method, …`. `400` on bad input (incl. platelets
for an unknown group), `503` if the starter data is missing.

### `GET /requests/{id}/options` — blood bank officer
Read-only.

```json
{"request": {…}, "method": "model | fallback", "ai_offline": false,
 "data_as_of": "2026-10-31", "held_option_id": 1,
 "options": [{"id": 1, "rank": 1, "facility_id": "HSP-001", "facility_name": "…",
   "eta": {"low_min": 45.2, "mid_min": 50.3, "high_min": 53.3}, "method": "model",
   "reason": "ETA ~50 min (45–53 min range) · 11 km good road · …",
   "warnings": ["…"], "units_available": 3, "is_partial": false,
   "unit_ids": ["U2610-NBO-052121-RBC"], "blood_groups": ["O-"], "is_held": true}]}
```

## Auth

`POST /auth/login {username, password}` → `{token, role, facility_id}`.
Send `Authorization: Token <token>` on every other call. Each endpoint checks the
caller's role; refused calls and every login attempt are written to the audit log.
