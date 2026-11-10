# Golden Hour — Project Knowledge Base

> Every agent reads this at the start of every session.
> Last updated: 2026-11-10 12:00 EAT (session 1)

---

## 0 — The Problem in One Sentence

A blood bank officer in Kenya gets a phone call from a hospital that has run out of blood. They need to find the nearest compatible unit across 47 facilities, verify the cold chain is intact, and dispatch it — right now. Currently this takes ~5 hours. We cut that time by giving the officer ranked options with honest ETAs and a one-tap Accept.

---

## 1 — Blood Domain Rules

### ABO Compatibility (RBC + Whole Blood)
This is a hard biological constraint. Never override it without officer confirmation.

| Donor Group | Can Give To |
|---|---|
| O− | O−, O+, A−, A+, B−, B+, AB−, AB+ (**universal donor**) |
| O+ | O+, A+, B+, AB+ |
| A− | A−, A+, AB−, AB+ |
| A+ | A+, AB+ |
| B− | B−, B+, AB−, AB+ |
| B+ | B+, AB+ |
| AB− | AB−, AB+ |
| AB+ | AB+ only (**universal recipient**) |

**For FFP/Plasma: compatibility is REVERSED** (AB plasma = universal donor for plasma).

### Component Shelf Lives (from collection date)
| Component | Shelf Life | Storage Temp | Notes |
|---|---|---|---|
| RBC | 42 days | 2–6°C | Most common for emergency requests |
| WB (Whole Blood) | 35 days | 2–6°C | Centres without separation capability |
| PLT (Platelets) | 5 days | 20–24°C | Most urgent — expires fastest |
| FFP | 1 year | Frozen | Long shelf life |
| CRYO | 1 year | Frozen | Long shelf life |

### Cold Chain Rules
- Safe RBC/WB storage range: **2–6°C**
- Safe range during transport (cool box): **below 10°C** (`coolbox_max_temp_c` in transfers)
- A unit with `temp_excursion_exposed = True` **must NOT be dispatched** without officer override + documentation
- Sensor glitches in `temperature_logs.csv`: values of `-99.0`, `99.9`, and `0.0` are hardware errors, not real readings

### Unknown Blood Group Protocol
- 5% of emergency requests arrive with `patient_blood_group = 'unknown'`
- Default: recommend **O−** (universal donor)
- Surface this clearly to the officer with a prominent warning
- Use Bayesian model (trained on request data) for probability estimate of actual group

---

## 2 — Data Schema Quick Reference

**DB:** `Starter Dataset/blood_system.sqlite` (also available as CSVs)
**Period:** 1 Nov 2025 → 31 Oct 2026 (EAT, UTC+3)
**Scale:** 47 facilities, 43K donors, 49K units, 17K requests

### Key Tables for Emergency Dispatch

```sql
-- Which facilities have compatible blood right now?
SELECT facility_id, component, blood_group, units_in_stock_end_of_day
FROM daily_stock
WHERE date = '2026-10-31'  -- use latest date as "current"
  AND component = 'RBC'
  AND blood_group IN ('O-', 'O+')  -- compatible groups for target patient
  AND units_in_stock_end_of_day > 0;

-- What is the actual travel time between two facilities?
SELECT road_km, typical_travel_hours, road_quality
FROM routes
WHERE from_facility_id = 'RBTC-NBO'
  AND to_facility_id = 'HSP-012';

-- What did historical transfers actually take?
SELECT dispatched_at, received_at, transport_mode,
       (julianday(received_at) - julianday(dispatched_at)) * 24 AS actual_hours
FROM transfers
WHERE from_facility_id = 'RBTC-NBO'
  AND received_at IS NOT NULL;

-- Which units have cold chain issues?
SELECT unit_id, blood_group, component, current_facility_id, expiry_date
FROM units
WHERE status = 'in_stock'
  AND temp_excursion_exposed = False
  AND expiry_date > date('now');
```

### Table Summary

| Table | Key Columns | Use For |
|---|---|---|
| `facilities` | facility_id, lat, lon, grid_reliability, connectivity, has_blood_fridge_backup_power | Facility profile, power risk |
| `routes` | from_facility_id, to_facility_id, road_km, typical_travel_hours, road_quality | Distance + baseline ETA |
| `daily_stock` | date, facility_id, component, blood_group, units_in_stock_end_of_day | Current stock levels |
| `units` | unit_id, component, blood_group, expiry_date, current_facility_id, status, temp_excursion_exposed | Individual unit tracking |
| `transfers` | from/to facility, dispatched_at, received_at, transport_mode, coolbox_max_temp_c | Historical transfer times (ML training) |
| `requests` | facility_id, component_requested, patient_blood_group, urgency, outcome, last_unit_available_at | Historical request outcomes |
| `temperature_logs` | facility_id, recorded_at, temp_c | Cold chain monitoring |
| `power_outages` | facility_id, duration_hours, backup_power_engaged | Power risk per facility |

### Known Data Quality Issues (intentional)
- 14% of requests have messy `facility_name_raw` — always use `facility_id` as truth
- 5% of emergency requests have `patient_blood_group = 'unknown'`
- 3% of transfers have no `received_at` (impute or exclude from ML training)
- Temperature log gaps = logger offline (not a cold event)
- `-99.0`, `0.0`, `99.9` in temperature = sensor glitch (filter out)

---

## 3 — Architecture Decisions (Locked)

| Decision | Choice | Reason |
|---|---|---|
| Data layer | SQLite (provided) | Already there, 500K rows, fast |
| Matching algorithm | scipy.optimize.linear_sum_assignment | Hungarian algorithm, O(n³), fast for 47 facilities |
| ETA model | scikit-learn RandomForestRegressor | Fast to train (< 2 min), interpretable, no GPU |
| API framework | FastAPI (Python) or Hono (TypeScript) | Fast to build, auto-docs, async |
| Frontend | React + Tailwind CSS | Mobile-first, fast iteration |
| Maps | Leaflet.js | Open source, works offline with cached tiles |
| Offline | PWA + Service Worker | Caches last-known stock, works on 2G/no-net |
| Deployment | Render or Railway (free tier) | 10-min deploy, free |

---

## 4 — The Scoring Algorithm

Every (unit, request) pair gets a cost score. Lower = better dispatch.

```python
def cost(unit, request, eta_hours, stock_snapshot):
    # Weights (tune these)
    w_time     = 0.5   # ETA dominates
    w_scarcity = 0.3   # Protect rare groups (O-)
    w_expiry   = 0.2   # FEFO: use units closest to expiry

    # Scarcity: how rare is this blood group across all facilities?
    total_of_this_group = stock_snapshot[unit.blood_group].sum()
    scarcity = 1 / (total_of_this_group + 1)  # higher when rare

    # Expiry urgency: 0 = expires today, 1 = full shelf life remaining
    days_left = (unit.expiry_date - today).days
    expiry_score = 1 - (days_left / max_shelf_life[unit.component])

    return w_time * eta_hours + w_scarcity * scarcity + w_expiry * expiry_score
```

**Hard constraints (cost = infinity if violated):**
- Blood group incompatible
- `temp_excursion_exposed = True` (unless officer overrides)
- Unit already expired
- Unit not `in_stock`

---

## 5 — ML ETA Model

**Training data:** `transfers.csv` (35,181 rows)
**Target:** `actual_hours = (received_at - dispatched_at) in hours`
**Filter:** exclude rows where `received_at IS NULL` (~3%)

**Features:**
```python
features = [
    'road_km',              # from routes table
    'road_quality_encoded', # good=0, fair=1, poor=2
    'transport_mode_encoded', # vehicle=0, motorbike=1, psv=2
    'hour_of_day',          # from dispatched_at
    'day_of_week',          # from dispatched_at
    'connectivity_encoded', # 4G=0, 3G=1, 2G=2 (of destination)
]
```

**Baseline to beat:** `routes.typical_travel_hours` (a fixed table lookup)
**Expected improvement:** ~15–25% lower MAE (mean absolute error)
**Output:** point estimate + confidence interval (use RF's tree variance for ±)

**Fallback (when model is offline):** use `routes.typical_travel_hours` directly

---

## 6 — African Conditions (Required for Judges)

| Condition | Our Response |
|---|---|
| 2G/3G connectivity | PWA with offline mode, last-known stock cached |
| Power cuts | Show `grid_reliability` score per facility; warn if source has low reliability |
| Basic Android phones | Mobile-first at 375px, large tap targets, no heavy payloads |
| Offline dispatch | Service worker caches API responses; officer can still see last-known options |
| SMS fallback | (Stretch goal) Officer texts a code, system texts back top recommendation |
| Multi-country | Config-driven: county/region names, blood group prevalence, language |

---

## 7 — Key Numbers to Know (From the Data)

Use these in the README, pitch, and demo:

- **~5 hrs** — median emergency resupply time today (our target: cut this significantly)
- **23%** — RBC/WB units wasted (expired or cold chain failure)
- **2,119** — units transfused despite known fridge excursion (zero alerts fired)
- **87%** — requests fully met (13% = lives at risk)
- **O−, B−, A−** — groups most likely to go unmet
- **60%** — donors are students (school holidays = collection crashes)
- **47** — facilities in the network
- **35,181** — historical transfers (our ML training set)

---

## 8 — Lessons Log

*(Append discoveries here during the hackathon. Promote to relevant section above when done.)*

---

*Golden Hour · Terumo BCT Africa Hackathon 2026 · Updated each session*
