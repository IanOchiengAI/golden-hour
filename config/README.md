# Country rules

Rules that differ by country sit in a YAML file, not in code. The backend reads one file, once per process.

| File | What it is |
|---|---|
| `kenya.yaml` | The default. Used when nothing else is set. |
| `uganda.yaml` | An **illustrative sample**. The values show that rules change by settings, not code. **They are not Uganda's official rules.** |

## How to switch

Set the environment variable `COUNTRY_CONFIG` to the path of the file, then **restart the backend**. The file is read once per process, so editing it while the server runs changes nothing.

A relative path is read from the folder you start the server in. From `backend/` use `../config/uganda.yaml`. An absolute path works from anywhere.

PowerShell:

```powershell
cd backend
$env:COUNTRY_CONFIG = "../config/uganda.yaml"
python manage.py runserver
```

Bash:

```bash
cd backend
COUNTRY_CONFIG=../config/uganda.yaml python manage.py runserver
```

To go back to Kenya, unset the variable and restart.

If a required key is missing or `emergency_authorisation` is not `standing` or `per_transfer`, the backend raises an error that names the file and the problem. This happens the first time the file is read (the first request that needs a rule), not when the server starts. This was read from `backend/emergency/country.py` and not tested with a broken file.

## What each key does

"Read by code" was checked by searching `backend/` on `main` (commit `7782fbe`).

| Key | Read by code | What it does | Kenya | Uganda sample |
|---|---|---|---|---|
| `country`, `country_code`, `timezone` | No | Labels only. Django's time zone is set in its own settings. | KE, Africa/Nairobi | UG, Africa/Kampala |
| `data_as_of` | Yes (required) | The dataset's "today" for expiry checks and ranking | 2026-10-31 | 2026-10-31 |
| `emergency_authorisation` | Yes (required) | `standing`: a life-threatening request goes to the supplier after the officer accepts, and the MoH officer is told. `per_transfer`: the MoH officer approves every transfer first. | standing | per_transfer |
| `urgency_targets_min` | Checked for presence only (required) | Target arrival time per urgency. No logic uses the values yet. | 60 / 240 / 1440 | same |
| `decision_escalation_min`, `authorisation_escalation_min` | Only to show a "decide by" time | No timer acts on them yet | 5, 10 | 10, 15 |
| `options_count` | Yes (required) | Ranked sites shown to the blood bank officer | 3 | 2 |
| `ranking_shortlist` | Yes | Nearest sites sent to the ETA model | 12 | 10 |
| `coolbox_max_temp_c` | Yes | Above this on receipt, the response carries a quarantine warning | 10 | 8 |
| `hold_ttl_min` | Yes | A hold on a request still waiting for the officer or MoH is released after this many minutes, and the request moves to `HandledManually` | 30 | 20 |
| `max_open_requests_per_facility` | Yes | Most open requests one hospital can have. More are refused. | 10 | 8 |
| `max_units_per_request` | Yes | Input limit on units in one request | 10 | 6 |
| `supplying_facility_types` | Yes | Facility types allowed to send blood | 9 types | same 9 |

The Kenya file has no keys for blood group prevalence or language. Nothing in the backend reads them, so these are not configurable today.

## Proof that switching works

Run on 11 Nov 2026 from a scratch copy of `origin/main` (`7782fbe`), with the sample file added. A fresh app database (`migrate`, `seed_demo_users`), one backend on port 8100, `LOGIN_THROTTLE_RATE=1000/min` and `RAISE_REQUEST_THROTTLE_RATE=1000/min` so the login and raise limits did not interfere.

Each run did the same thing through the API:

1. `clinician@goldenhour.health` raises a life-threatening request, O+ RBC, 1 unit (`POST /requests`).
2. `officer@goldenhour.health` reads the options (`GET /requests/{id}/options`) and accepts (`POST /requests/{id}/decision`, `{"action": "accept"}`).
3. The status after the accept is recorded.

Commands, from `backend/` after `python manage.py migrate` and `python manage.py seed_demo_users`:

```bash
# Run 1: default config
LOGIN_THROTTLE_RATE=1000/min RAISE_REQUEST_THROTTLE_RATE=1000/min \
  python manage.py runserver 127.0.0.1:8100 --noreload

# Run 2: restart with the Uganda sample
COUNTRY_CONFIG=../config/uganda.yaml LOGIN_THROTTLE_RATE=1000/min RAISE_REQUEST_THROTTLE_RATE=1000/min \
  python manage.py runserver 127.0.0.1:8100 --noreload
```

Observed:

| | Kenya (default) | Uganda sample |
|---|---|---|
| Options shown to the officer | 3 | 2 |
| Status after the officer accepts | `SentToSupplier` | `AwaitingAuthorisation` |
| `authorisation_route` | `standing` | `per_transfer` |
| Dispatch created at that point | Yes | No |
| After the MoH officer approves | not needed | `SentToSupplier` |
| Supplying lab confirms, marks in transit, clinician receives with a 9 °C cool box | `Received`, no warning (limit 10 °C) | `Received`, warning: "Cool box reached 9 °C (limit 8 °C) ... quarantine these units" |

Same code and same request. Only the settings file changed. The servers were stopped after the runs.

What this run did not check:

- The other keys (`hold_ttl_min`, `max_open_requests_per_facility`, `max_units_per_request`, `ranking_shortlist`) were not exercised. The backend's own tests cover some of them by patching the config. Their effect under `uganda.yaml` was not observed here.
- The frontend does not read the config. `frontend/src/components/ClinicianView.tsx` has `MAX_UNITS = 10` written in, so under `uganda.yaml` the form still allows 10 units and the backend then refuses more than 6.
- The ML model and ranking were the same in both runs. Only the number of options and the authorisation route were compared.
