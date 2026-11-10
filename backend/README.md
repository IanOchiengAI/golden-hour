# Golden Hour — Backend (Django + DRF)

Owner: Roland Sankara · Branch: `ft/backend`

The backend takes an emergency blood request from a clinician, finds safe and
compatible units across the 47 facilities, ranks the supplying sites with the ML
ETA model, and holds the units at the best site straight away so the blood bank
officer can decide.

**Built so far:** login, roles, audit log, rules engine, `POST /requests`,
`GET /requests/{id}/options`, Django admin (view-only for workflow data).
**Not built yet:** decision, authorisation, release, dispatch status, `GET /audit`
(see [What's next](#whats-next)).

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Setup](#2-setup)
3. [Run the server](#3-run-the-server)
4. [Run the automated tests](#4-run-the-automated-tests)
5. [Test the API by hand](#5-test-the-api-by-hand)
6. [Test in the Django admin](#6-test-in-the-django-admin)
7. [API reference](#7-api-reference)
8. [How matching works](#8-how-matching-works)
9. [Configuration](#9-configuration)
10. [Code layout](#10-code-layout)
11. [Troubleshooting](#11-troubleshooting)
12. [What's next](#whats-next)

---

## 1. Prerequisites

- **Python 3.11 or newer** (tested on 3.13)
- **Git**
- About 200 MB of disk space for the rebuilt dataset

All commands below run from the `backend/` folder. Windows commands are for
PowerShell; macOS/Linux commands are for bash/zsh.

## 2. Setup

### 2.1 Create a virtual environment and install packages

**Windows (PowerShell)**
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**macOS / Linux**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

> `scikit-learn` is pinned to **1.9.1** on purpose. The saved model
> `ml/eta_model.pkl` will not load with any other version.

If PowerShell refuses to run `Activate.ps1`, skip activation and prefix every
command with `.venv\Scripts\` (for example `.venv\Scripts\python manage.py test`).

### 2.2 Build the starter database (once)

The file `Terumo BCT Hackathon - Applicant_s Kit/Starter Dataset/blood_system.sqlite`
is committed to git as an **empty (0-byte) file**. This script rebuilds it from
the provided CSVs, the same way the kit's own `gen.py` does:

```bash
python scripts/build_starter_db.py
```

Expected output ends with `Built …blood_system.sqlite` after listing 11 tables
(e.g. `units 49,426 rows`). Add `--force` to rebuild an existing file.

> ⚠️ **Never commit the rebuilt file.** It is ~100 MB, over GitHub's file limit.
> To stop git from staging it by accident:
> ```bash
> git update-index --skip-worktree "Terumo BCT Hackathon - Applicant_s Kit/Starter Dataset/blood_system.sqlite"
> ```

`ml/predict.py` also reads routes from this file, so Ian's model needs it too.

### 2.3 Create the app database and demo users

```bash
python manage.py migrate
python manage.py seed_demo_users
```

`seed_demo_users` creates one user per role. Password for all: **`demo2026`**
(override with the `DEMO_PASSWORD` environment variable). All data is synthetic.

| Username | Role | Facility |
|---|---|---|
| `clinician@goldenhour.health` | `clinician` | HSP-002 (requesting hospital) |
| `officer@goldenhour.health` | `blood_bank_officer` | RBTC-NBO |
| `backup.officer@goldenhour.health` | `blood_bank_officer` | RBTC-NBO |
| `moh@goldenhour.health` | `moh_officer` | — |
| `lab@goldenhour.health` | `lab_officer` | RBTC-NBO |

These users work for the **API only**; they cannot log in to `/admin`.

### 2.4 Create an admin account (for `/admin`)

```bash
python manage.py createsuperuser
```

Enter a username, optional email, and a password twice. For a local dev account
you can answer `y` if it warns the password is weak.

Non-interactive version:

```powershell
# Windows
$env:DJANGO_SUPERUSER_PASSWORD = "choose-a-password"
python manage.py createsuperuser --noinput --username admin --email admin@example.com
```
```bash
# macOS / Linux
DJANGO_SUPERUSER_PASSWORD=choose-a-password python manage.py createsuperuser --noinput --username admin --email admin@example.com
```

The admin account lives only in your local `backend/app.sqlite3` (git-ignored).
Each person creates their own.

## 3. Run the server

```bash
python manage.py runserver 8000
```

- API: `http://127.0.0.1:8000`
- Admin: `http://127.0.0.1:8000/admin/`

The ETA model takes 5–10 seconds to load. It loads in the background when the
server starts, so a request sent in the first few seconds may be slow; after that
a request takes about 1–2 seconds.

## 4. Run the automated tests

```bash
python manage.py test
```

Expected: `Ran 35 tests … OK`.

| File | Covers |
|---|---|
| `emergency/tests/test_rules.py` | Compatibility tables (checked against an independent antigen rule), unknown-group protocol, every unit exclusion, unit pick order, partial sites |
| `emergency/tests/test_create_request.py` | `POST /requests`: holds, full audit trail, unknown group, no double-holding, no-stock case, model offline, ML crash, roles, input validation |
| `emergency/tests/test_options.py` | `GET /options`: shape, ETA range order, held flag, read-only, fallback flag, roles, 404 |

A `RuntimeError: boom` traceback in the output is **expected**: one test
deliberately crashes the ML ranker to prove the fallback works.

Tests read the real starter database (read-only). If it has not been built, the
endpoint tests are skipped, not failed — run step 2.2 first.

## 5. Test the API by hand

Start the server (step 3), then use a second terminal.

### 5.1 Windows (PowerShell)

```powershell
$B = "http://127.0.0.1:8000"
function Login($u) { (Invoke-RestMethod -Method Post "$B/auth/login" -ContentType "application/json" -Body (@{username=$u; password="demo2026"} | ConvertTo-Json)).token }
$C = @{Authorization = "Token $(Login 'clinician@goldenhour.health')"}
$O = @{Authorization = "Token $(Login 'officer@goldenhour.health')"}

# A. Clinician raises a request → expect status AwaitingDecision
$req = Invoke-RestMethod -Method Post "$B/requests" -Headers $C -ContentType "application/json" `
  -Body '{"patient_blood_group":"O+","component":"RBC","units_requested":2,"urgency":"life_threatening"}'
$req | Format-List id, status, compatible_groups, eta_method

# B. Officer reads the ranked options → up to 3 sites, only rank 1 held
$opt = Invoke-RestMethod "$B/requests/$($req.id)/options" -Headers $O
$opt | Format-List method, ai_offline, data_as_of
$opt.options | Format-Table rank, facility_name, @{n='ETA low-mid-high';e={"$($_.eta.low_min)-$($_.eta.mid_min)-$($_.eta.high_min)"}}, units_available, is_partial, is_held

# C. Unknown blood group → RBC gets O- only, FFP gets AB only, both with a warning
(Invoke-RestMethod -Method Post "$B/requests" -Headers $C -ContentType "application/json" -Body '{"patient_blood_group":"unknown","component":"RBC","units_requested":1,"urgency":"life_threatening"}') | Format-List compatible_groups, warnings
(Invoke-RestMethod -Method Post "$B/requests" -Headers $C -ContentType "application/json" -Body '{"patient_blood_group":"unknown","component":"FFP","units_requested":1,"urgency":"urgent"}') | Format-List compatible_groups, warnings

# D. No stock anywhere (AB- platelets) → status HandledManually
(Invoke-RestMethod -Method Post "$B/requests" -Headers $C -ContentType "application/json" -Body '{"patient_blood_group":"AB-","component":"PLT","units_requested":1,"urgency":"urgent"}').status

# E. Refusals → 400, 403, 401
function Code($s) { try { & $s | Out-Null; 200 } catch { $_.Exception.Response.StatusCode.value__ } }
Code { Invoke-RestMethod -Method Post "$B/requests" -Headers $C -ContentType "application/json" -Body '{"patient_blood_group":"unknown","component":"PLT","units_requested":1,"urgency":"urgent"}' }
Code { Invoke-RestMethod "$B/requests/$($req.id)/options" -Headers $C }
Code { Invoke-RestMethod "$B/requests/$($req.id)/options" }
```

> In Windows PowerShell 5.1, characters like `—` and `·` may show as `â€”`.
> That is PowerShell misreading the text; the server sends correct UTF-8 and
> browsers display it properly.

### 5.2 macOS / Linux (curl + jq)

```bash
B=http://127.0.0.1:8000
login() { curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"$1\",\"password\":\"demo2026\"}" | jq -r .token; }
C="Authorization: Token $(login clinician@goldenhour.health)"
O="Authorization: Token $(login officer@goldenhour.health)"

# A. Raise a request
ID=$(curl -s -X POST $B/requests -H "$C" -H 'Content-Type: application/json' \
  -d '{"patient_blood_group":"O+","component":"RBC","units_requested":2,"urgency":"life_threatening"}' | tee /dev/stderr | jq .id)

# B. Officer reads options
curl -s $B/requests/$ID/options -H "$O" | jq '.method, .options[] | {rank, facility_name, eta, is_held, is_partial}'

# E. Refusals
curl -s -o /dev/null -w "%{http_code}\n" $B/requests/$ID/options -H "$C"   # 403
curl -s -o /dev/null -w "%{http_code}\n" $B/requests/$ID/options          # 401
```

### 5.3 Check the audit trail

There is no `GET /audit` endpoint yet. Use the admin (section 6) or the shell
(replace `1` with your request id):

```bash
python manage.py shell -c "from emergency.models import AuditEvent as A; [print(e.created_at.strftime('%H:%M:%S'), e.actor_role, e.action, (e.after or {}).get('status','')) for e in A.objects.filter(request_id=1)]"
```

Expected order: `request_raised` → `status_changed Matching` → `matching_completed`
→ `units_held` → `status_changed UnitsHeld` → `status_changed AwaitingDecision`.

## 6. Test in the Django admin

Log in at `http://127.0.0.1:8000/admin/` with the superuser from step 2.4.

| Section | What to check |
|---|---|
| **Users** | Each user page has a *Role and facility* section. You can add a new clinician or officer here instead of using `seed_demo_users`. |
| **Emergency requests** | Filter by status, urgency, component. Open one to see its ranked options, unit holds and full audit trail on one page. |
| **Unit holds** | *Active* column shows which units are reserved now. The same unit id must never be active for two requests. |
| **Audit events** | Every action, including `login`, `login_failed` and `access_denied`. Filter by action. |

Requests, options, holds and audit events are **view-only** in the admin (no
add, edit or delete). This is deliberate: changes must go through the API, which
checks roles, enforces the status rules and writes the audit log. Create test
requests with section 5, then inspect them here.

## 7. API reference

**Base URL:** `http://127.0.0.1:8000` · **Format:** JSON · **Paths:** no `/api`
prefix and **no trailing slash**.

### Authentication

Every endpoint except login needs the header:

```
Authorization: Token <token>
```

Each endpoint allows only certain roles. A call from the wrong role gets `403`
and is written to the audit log as `access_denied`.

### Errors

| Code | When | Body |
|---|---|---|
| `400` | Invalid input | `{"field_name": ["message"]}` |
| `401` | No token / bad token / wrong login | `{"detail": "..."}` |
| `403` | Your role cannot call this endpoint, or your account has no facility | `{"detail": "Your role cannot perform this action."}` |
| `404` | Request id does not exist | `{"detail": "..."}` |
| `429` | Too many login attempts (default 10/min) | `{"detail": "Request was throttled..."}` |
| `503` | Starter database missing or empty | `{"detail": "... Run: python backend/scripts/build_starter_db.py"}` |

---

### `POST /auth/login`

Anyone. Rate-limited. Every attempt (success or failure) is audited.

Request:
```json
{"username": "officer@goldenhour.health", "password": "demo2026"}
```

Response `200`:
```json
{
  "token": "9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b",
  "username": "officer@goldenhour.health",
  "role": "blood_bank_officer",
  "facility_id": "RBTC-NBO"
}
```

`role` is one of `clinician`, `blood_bank_officer`, `moh_officer`, `lab_officer`.
Wrong username or password → `401`.

---

### `POST /requests`

**Role:** `clinician`. Raises a request for the clinician's own facility (taken
from their account, not the body). Matching, ranking and the auto-hold of the
top site's units all happen in this call.

Request:

| Field | Type | Required | Values |
|---|---|---|---|
| `patient_blood_group` | string | yes | `O-` `O+` `A-` `A+` `B-` `B+` `AB-` `AB+` `unknown` |
| `component` | string | yes | `RBC` (red cells), `PLT` (platelets), `FFP` (plasma) |
| `units_requested` | integer | yes | 1 to `max_units_per_request` (10) |
| `urgency` | string | yes | `life_threatening`, `urgent`, `routine` |
| `clinical_note` | string | no | up to 500 characters |

```json
{"patient_blood_group": "unknown", "component": "RBC", "units_requested": 1, "urgency": "life_threatening"}
```

Response `201`:
```json
{
  "id": 1,
  "requesting_facility_id": "HSP-002",
  "patient_blood_group": "unknown",
  "component": "RBC",
  "units_requested": 1,
  "urgency": "life_threatening",
  "clinical_note": "",
  "status": "AwaitingDecision",
  "compatible_groups": ["O-"],
  "warnings": ["Patient blood group unknown — recommending O− universal donor red cells. Confirm before dispatch; O− stock is critically low."],
  "eta_method": "model",
  "created_at": "2026-11-10T19:13:49.034102+03:00",
  "updated_at": "2026-11-10T19:13:49.857075+03:00"
}
```

- `status` is `AwaitingDecision` (units held at the top site) or
  `HandledManually` (no safe, compatible stock anywhere).
- `eta_method` is `model` or `fallback` (model offline; route table used).
- Platelets with `unknown` group → `400` (the patient must be grouped first).

---

### `GET /requests/{id}/options`

**Role:** `blood_bank_officer`. Read-only: returns the options saved when the
request was raised. Calling it never re-runs matching or changes anything.

Response `200`:
```json
{
  "request": { "...": "same object as POST /requests returns" },
  "method": "model",
  "ai_offline": false,
  "data_as_of": "2026-10-31",
  "held_option_id": 1,
  "options": [
    {
      "id": 1,
      "rank": 1,
      "facility_id": "HSP-001",
      "facility_name": "National Referral Hospital (Nairobi)",
      "eta": {"low_min": 45.2, "mid_min": 50.3, "high_min": 53.3},
      "method": "model",
      "reason": "ETA ~50 min (45–53 min range) · 11 km good road · 3 unit(s) O- available · expires 2026-11-22",
      "warnings": ["Rare blood group (O-) — scarcity rules applied"],
      "units_available": 3,
      "is_partial": false,
      "unit_ids": ["U2610-NBO-052121-RBC"],
      "blood_groups": ["O-"],
      "is_held": true
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `ai_offline` | `true` when ETAs came from the route table. Show the "AI offline" banner. |
| `data_as_of` | The dataset's "today", used for expiry checks. |
| `held_option_id` | The option whose units are currently reserved (rank 1 after raising). |
| `options[].eta` | Arrival estimate in minutes. Always show the range, not just `mid_min`. |
| `options[].reason` | Plain-language explanation to show the officer. |
| `options[].is_partial` | Site has fewer units than requested. |
| `options[].unit_ids` | Units this site would send, in pick order. |

Up to `options_count` (3) options, best first.

### Request status lifecycle

```
Raised → Matching → UnitsHeld → AwaitingDecision (→ Escalated)
       → AwaitingAuthorisation (or straight on under standing authorisation)
       → SentToSupplier → Dispatched → InTransit → Received
Matching → HandledManually   (no stock; later also Reject / not approved)
DraftFromCall → Raised        (voice requests, add-on)
```

Only these moves are allowed (`emergency/services.py: ALLOWED_TRANSITIONS`), and
each one writes an audit event. Today a request reaches `AwaitingDecision` or
`HandledManually`; later endpoints move it further.

## 8. How matching works

Runs inside `POST /requests`:

1. **Compatible groups** (`rules.compatible_donor_groups`): fixed ABO/RhD tables.
   - Red cells: standard table (O− gives to all).
   - Plasma (FFP): reversed (AB gives to all); RhD ignored.
   - Platelets: plasma-compatible ABO, and RhD-negative patients get RhD-negative.
   - Unknown group: RBC → O− only, FFP → AB only, each with a warning.
     Platelets need a known group.
2. **Unit safety filter** (`rules.check_unit`). A unit is excluded if it is:
   not `in_stock`; exposed to a temperature excursion; expired on or before
   `data_as_of`; from a donation not screened `non_reactive` with a test date;
   or already held for another request. Counts per reason go in the audit log.
3. **Per-site pick** (`rules.pick_units`): exact group first, other compatible
   groups next, universal-donor groups (O− / AB) last unless the patient needs
   them, then soonest expiry first (FEFO). The requesting hospital is never its
   own supplier. Sites with too few units are kept and marked partial.
4. **Shortlist:** the 12 nearest sites by the route table go to the model.
5. **Ranking:** `ml.ranking.rank_candidates()` adds ETA range, score and reason.
   If the model does not load or ranking fails, the backend ranks by
   `routes.typical_travel_hours` ±20% and marks `method = fallback`.
6. **Order:** sites with enough units first, partial sites after.
7. **Auto-hold:** the rank-1 site's units are reserved. The database allows only
   one active hold per unit, so two requests can never hold the same unit.

**AI boundary:** the model never decides compatibility or safety. It only orders
sites that already passed every rule, and estimates their arrival time.

## 9. Configuration

### Country rules — `config/kenya.yaml`

Rules change here, not in code. Keys the backend reads:

| Key | Use |
|---|---|
| `data_as_of` | Dataset "today" (2026-10-31) for expiry checks |
| `emergency_authorisation` | `standing` or `per_transfer` (used by the authorise step, coming next) |
| `urgency_targets_min` | Target arrival time per urgency |
| `decision_escalation_min`, `authorisation_escalation_min` | Escalation timers (coming next) |
| `options_count` | Ranked sites shown to the officer |
| `ranking_shortlist` | Nearest sites sent to the model |
| `max_units_per_request` | Input limit |
| `supplying_facility_types` | Facility types allowed to send blood |

To use another country, copy the file and set `COUNTRY_CONFIG` to its path.

### Environment variables

| Variable | Default | Notes |
|---|---|---|
| `DJANGO_SECRET_KEY` | dev key when debugging | **Required** when `DJANGO_DEBUG=0` |
| `DJANGO_DEBUG` | `1` | Set `0` when deployed (turns on HTTPS hardening) |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated |
| `COUNTRY_CONFIG` | `config/kenya.yaml` | Country rules file |
| `STARTER_DB_PATH` | the kit's `blood_system.sqlite` | Opened read-only |
| `APP_DB_PATH` | `backend/app.sqlite3` | Users, requests, holds, audit |
| `LOGIN_THROTTLE_RATE` | `10/min` | Login rate limit |
| `DEMO_PASSWORD` | `demo2026` | Used by `seed_demo_users` |
| `WARM_ML_MODEL` | `1` | Set `0` to skip loading the model at start-up |
| `OPENBLAS_NUM_THREADS` | `1` (set in settings) | Limits numpy's maths threads; more threads ran out of memory |

### Two databases

| Database | File | Access | Holds |
|---|---|---|---|
| Starter data | `…/Starter Dataset/blood_system.sqlite` | **read-only** (`emergency/stock.py`) | facilities, routes, units, donations … |
| App data | `backend/app.sqlite3` | Django ORM | users, requests, ranked options, unit holds, audit log |

The provided data is never modified.

## 10. Code layout

```
backend/
├── manage.py
├── requirements.txt              pinned versions
├── scripts/build_starter_db.py   rebuilds blood_system.sqlite from the CSVs
├── goldenhour/                   project settings and root URLs
├── accounts/                     users, roles, login
│   ├── models.py                 Role, StaffProfile (role + facility)
│   ├── permissions.py            roles_allowed(...) — role check, audits refusals
│   ├── views.py                  POST /auth/login
│   └── management/commands/seed_demo_users.py
└── emergency/                    the request workflow
    ├── rules.py                  rules engine (no database, no AI)
    ├── stock.py                  read-only queries on the starter data
    ├── matching.py               rules → shortlist → ML ranking or fallback
    ├── services.py               create_request, auto-hold, status transitions
    ├── audit.py                  record(...) — one helper for every audit event
    ├── country.py                loads config/kenya.yaml
    ├── models.py                 EmergencyRequest, RankedOption, UnitHold, AuditEvent
    ├── serializers.py, views.py, urls.py, admin.py
    └── tests/
```

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| `503` … "missing or empty" | Run `python scripts/build_starter_db.py` (step 2.2). |
| Endpoint tests show as *skipped* | Same: build the starter database. |
| `401` on every call | Add the header `Authorization: Token <token>` (word `Token`, a space, then the token). |
| `403` on a call | Wrong role for that endpoint, e.g. a clinician calling `/options`. Log in as the right user. |
| Demo user can't log in to `/admin` | Expected. Create a superuser (step 2.4). |
| `404` on `/requests/` | Remove the trailing slash: `/requests`. |
| Every response says `"eta_method": "fallback"` | Model did not load. Check `pip show scikit-learn` is **1.9.1** and `ml/eta_model.pkl` exists. |
| First request is slow | The model is still loading (5–10 s after start-up). |
| `â€”` instead of `—` in PowerShell | PowerShell 5.1 display issue only. |
| `OpenBLAS error: Memory allocation still failed` | Low memory. Settings already limit numpy to one thread; also stop other `runserver` processes and close heavy apps. |
| `$env:...: command not found` | You are in Git Bash, not PowerShell. Use the macOS/Linux commands (`export VAR=value`, forward slashes). |
| `git status` shows `blood_system.sqlite` modified | Expected after rebuilding. Do not commit it (see step 2.2). |
| Frontend gets CORS errors | No CORS middleware yet. Use a Vite dev proxy to `http://localhost:8000`. |

## What's next

| Endpoint | Role | Does |
|---|---|---|
| `POST /requests/{id}/decision` | blood bank officer | Accept / Change (moves the hold) / Reject (releases it) |
| `POST /requests/{id}/authorise` | MoH officer | Approve or reject; standing authorisation for life-threatening |
| `POST /dispatches/{id}/release` | lab officer | Confirm or decline; decline holds the next-ranked site |
| `POST /dispatches/{id}/status` | — | Dispatched → in transit → received |
| `GET /audit?request_id=` | demo / judges | Full audit trail |
| `GET /readiness` | manager | Add-on |
