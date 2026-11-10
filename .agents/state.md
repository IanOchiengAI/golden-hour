# Golden Hour — Project State

> Read this to know exactly where the project is right now.
> Update this at the end of every session or major milestone.

---

## Project Identity

| Field | Value |
|---|---|
| **Team** | Golden Hour |
| **Challenge** | Emergency Request & Dispatch |
| **Hackathon** | Terumo BCT Africa Hackathon 2026 |
| **Build window** | Tue 10 Nov 12:00 → Wed 11 Nov 12:00 EAT |
| **GitHub repo** | https://github.com/IanOchiengAI/golden-hour |
| **Live demo** | *[To be deployed]* |
| **Submission form** | https://docs.google.com/forms/d/e/1FAIpQLSfpGlw4gKrrhRZobffRZreKFFSgGXQ1r4Hw4fxZap8NgdqDCg/viewform |
| **Check-in form** | https://docs.google.com/forms/d/e/1FAIpQLSfu1LgJRDJdEFr91opKYw6uBVRoK_pXEhqvx4bQgayp3ol8Wg/viewform |

---

## Team

| Person | Role | Skills | Available |
|---|---|---|---|
| Ian Ochieng | Data + AI | Dataset exploration, ETA model, ranking, baseline numbers | Now |
| Joronimo Amanya | Frontend | Clinician request form, officer screen (Accept/Change/Reject), supplying lab screen, readiness map | Now |
| Roland Sankara | Backend | Django + DRF API, rules engine, request status flow, audit log, Africa's Talking SMS, integration | Now |
| Daniel Bitengo | Architecture, Docs, Demo | Architecture diagram, data model, deployment, README, slides, demo video, end-to-end testing | From ~19:00 EAT |

---

## Session Log

| Timestamp (EAT) | Who | What |
|---|---|---|
| 2026-11-10 12:00 | Ian | Hackathon clock started. Project briefed. Architecture planned. .agents folder created. |
| 2026-11-10 ~14:00 | Ian, Roland, Amanya | First team call. Repo shown and walked through. Check-in form submitted with roster + GitHub link. |
| 2026-11-10 15:00 | Ian, Roland, Amanya | Blood-service expert Q&A session. KDPA compliance notes captured (see KNOWLEDGE.md §9). |
| 2026-11-10 ~16:00 | Roland (via Claude) | Team plan shared: roles, API contract, tech stack, status lifecycle, cut rules, sleep shifts. |
| 2026-11-10 16:15 | Ian | Pre-build review. Tech stack NOT yet decided. No code committed. Build starts 16:30. |
| 2026-11-10 16:30–17:16 | Ian | Full data exploration complete. All 4 cleaning rules verified against real data. ETA model trained and pushed to GitHub. |
| 2026-11-10 ~17:30–19:20 | Roland (via Claude Code) | Backend on `ft/backend`: Django + DRF scaffold, token auth + roles, audit log, rules engine + tests, `POST /requests` (matching + auto-hold at creation), `GET /requests/{id}/options` (read-only). 35 tests pass. Found `blood_system.sqlite` committed as 0 bytes; added rebuild script. |
| 2026-11-10 ~19:30–22:00 | Ian (via Antigravity) | Full ML iteration session. Emergency-weighted training (3×/2×/1×). Conformal calibration on emergency+urgent subset only (n=1,028) → 91.1% emergency coverage (was 73%). Final numbers: Overall MAE 14.5 min (20.7% better), Emergency MAE 30.8 min (25.8% better). Thread-safe model cache. 4-tuple predict_eta return (low, mid, high, method). `as_of` param in ranking. Data-driven ETA cap (602 min). `docs/ian-numbers.md` written. `docs/e2e_test.py` written and pushed. Replied to Roland's GitHub issue #4 (commit 055cf35 + b7284d0 + 6748755). |

---

## What's Built ✅

- [x] `.agents/` folder with AGENTS.md, KNOWLEDGE.md, state.md, DECISIONS_LOG.md
- [x] `golden-hour-brief.html` — living brief with full problem breakdown
- [x] Check-in form submitted (roster + GitHub repo link)
- [x] Team roles agreed and documented
- [x] API contract agreed (7 endpoints — see KNOWLEDGE.md §10)
- [x] Request status lifecycle defined (Raised → Received)
- [x] Expert session notes captured (KDPA compliance — see KNOWLEDGE.md §9)
- [x] **`ml/train_eta.py`** — trains Random Forest on 34,135 clean transfers. Run once to produce `eta_model.pkl`
- [x] **`ml/predict.py`** — Roland imports this. `predict_eta(source_id, dest_id, now)` → `(low, mid, high)` in minutes. Auto-fallback to table lookup if model offline.
- [x] **`ml/eta_model.pkl`** — trained model saved to repo
- [x] Baseline vs model numbers confirmed (final, emergency-weighted): **Overall: Baseline 18.3 → Model 14.5 min (20.7% better), coverage 96.2%. Emergency: Baseline 41.5 → Model 30.8 min (25.8% better), coverage 91.1% ✅**
- [x] **`ml/predict.py`** — thread-safe (Lock + double-checked locking), returns 4-tuple `(low, mid, high, method)`, conformal intervals (q05/q95 from emergency calib set), `_fmt_minutes()`, `get_eta_cap()`, `explain_eta()` with optional `route=` param
- [x] **`ml/ranking.py`** — `DATA_AS_OF=date(2026,10,31)`, `_ETA_CAP_MINUTES` from model, `rank_candidates` takes `as_of`, passes `route=` to `explain_eta`, exposes `eta_method` in result dict, scarcity warning for O−
- [x] **`ml/train_eta.py`** — 3-way 60/20/20 split, urgency join, emergency 3×/urgent 2× sample weights, emergency+urgent conformal calibration, full metrics breakdown
- [x] **`ml/eta_model.pkl`** — retrained with keys: `rf`, `q05`, `q95`, `eta_cap`, `metrics`
- [x] **`docs/ian-numbers.md`** — final numbers table, model card, pitch sentence, judge Q&A answers
- [x] **`docs/e2e_test.py`** — black-box end-to-end API test script (pushed, commit 6748755)
- [x] **GitHub issue #4** — replied to Roland (Dancode-188) with updated numbers and confirmation of both fixes
- [x] **Backend (`backend/`, branch `ft/backend`)** — see `backend/README.md` for run steps and API shapes
  - Django 5.2 + DRF; token login `POST /auth/login` (rate-limited); role check on every endpoint; logins, failed logins and refused calls audited
  - Append-only `AuditEvent`; `EmergencyRequest`, `RankedOption`, `UnitHold` (DB allows one active hold per unit)
  - `emergency/rules.py` — ABO/RhD tables (RBC; reversed for FFP; PLT strict), unknown group → RBC O− / FFP AB with warning (PLT refused), unit filter (in stock, no excursion, not expired vs `data_as_of`, screened non-reactive, not held), per-site pick (exact group first, universal donor last, FEFO), partial sites flagged
  - `POST /requests` — clinician; matching + ML ranking + auto-hold of top site run here; Raised → Matching → UnitsHeld → AwaitingDecision (or HandledManually when no stock)
  - `GET /requests/{id}/options` — blood bank officer; read-only; ETA range, `method`, `ai_offline`, reason, `is_held`
  - Fallback: if the model won't load or ranking throws, backend ranks by route table ±20% with `method = fallback`
  - `config/kenya.yaml` created with `data_as_of: 2026-10-31`, `emergency_authorisation`, urgency targets, escalation minutes, `options_count`, `ranking_shortlist`
  - `backend/scripts/build_starter_db.py` rebuilds `blood_system.sqlite` from the CSVs (adds indexes)
  - Demo users: `python manage.py seed_demo_users` (clinician / officer / backup.officer / moh / lab `@goldenhour.health`, password `demo2026`)

---

## In Progress 🔄

- [ ] Frontend scaffold (Amanya) — can switch `POST /requests` and `GET /options` from mocks to the real API now
- [ ] Backend next: `POST /requests/{id}/decision` (Accept / Change moves hold / Reject releases), `/authorise`, `/dispatches/{id}/release`, `/dispatches/{id}/status`, `GET /audit`

---

## Next Up 📋

**Backend (Roland), toward the 22:00 gate:**
1. Merge `ft/backend` to `main` (checkpoint)
2. `POST /requests/{id}/decision` — Accept / Change (moves hold to chosen option) / Reject (releases hold → HandledManually), reason required for Change/Reject
3. `POST /requests/{id}/authorise` — tier from `emergency_authorisation`; standing + life-threatening skips to SentToSupplier with MoH notified
4. `Dispatch` model, `POST /dispatches/{id}/release` (decline → release hold, auto-hold next-ranked site), `POST /dispatches/{id}/status`
5. `GET /audit?request_id=`
6. Supplier view must hide patient fields

**Frontend (Amanya):** request form + officer screen against the real `POST /requests` and `GET /options`

**By Tue 22:00 gate:**
- Dispatch flow end-to-end (or stop all add-ons and fix it)

---

## Open Blockers 🚧

- [x] ~~Tech stack not decided~~ — Django + DRF, SQLite (see CLAUDE.md)
- [ ] **`blood_system.sqlite` is a 0-byte file in git.** Everyone (incl. `ml/predict.py`, which reads routes from it) must run `python backend/scripts/build_starter_db.py` once. Do **not** commit the rebuilt file (~100 MB, over GitHub's limit) — leave it unstaged.
- [ ] **Daniel not yet online** — joins ~19:00; needs handoff doc ready

## Notes for owners (from backend integration)

**Ian (`ml/`) — all items below are FIXED as of 22:00 EAT:**
- ✅ `compute_dispatch_score()` / `rank_candidates` now take `as_of=date(2026,10,31)` — no more date.today() drift
- ✅ `predict_eta()` returns 4-tuple `(low, mid, high, method)` — backend no longer needs to call `_load_model()`
- ✅ `rank_candidates` result dicts include `eta_method: "model"|"fallback"`
- ✅ Emergency coverage: 91.1% (was 73%) via emergency-subset conformal calibration
- ⚠️ **For Roland:** when calling `rank_candidates`, pass `as_of=date(2026, 10, 31)` and include `national_group_stock` in candidate dicts (WARNING fires if missing). Read `result["eta_method"]` instead of calling `_load_model()`.
- ⚠️ **Race condition (not Ian's to fix):** rank+hold sequence is not atomic — two simultaneous requests can race for the same O− unit. Roland needs `select_for_update()` in a transaction.

**Daniel (`config/`):** `config/kenya.yaml` was created by backend with the keys it reads (see file comments). Add the sample second country by copying it; switch with env `COUNTRY_CONFIG`.

**Amanya (`frontend/`):** API has no `/api` prefix and no trailing slashes (`/requests`, `/requests/1/options`). No CORS middleware yet — use a Vite dev proxy to `http://localhost:8000`. Response shapes in `backend/README.md`.

**Data gaps:** the dataset has no quarantine flag; "untested" is enforced by requiring the unit's donation to be screened `non_reactive` with a `tested_date`. Supported components are RBC, PLT, FFP (what the requests data uses); WB and CRYO are not requestable yet.

---

## Architecture Decisions Made

| Decision | Choice | Reason | Date |
|---|---|---|---|
| DB | SQLite (provided) | Already loaded with all 11 tables | 2026-11-10 |
| Matching | scipy.optimize.linear_sum_assignment | Hungarian algorithm, fast | 2026-11-10 |
| ETA output | (low, mid, high) range in minutes | Quantile regression; more honest than ± std | 2026-11-10 |
| Maps | Leaflet.js | OSS, offline-capable | 2026-11-10 |
| Offline | PWA + Service Worker | African conditions requirement | 2026-11-10 |
| SMS | Africa's Talking sandbox | Roland owns | 2026-11-10 |
| Config | YAML per country | kenya.yaml + one sample; proves config-not-code | 2026-11-10 |

**Pending decisions (resolve at 16:30):**
- Backend framework: Django + DRF (team plan) vs FastAPI (Ian's preference — less boilerplate)
- Database: PostgreSQL (team plan) vs SQLite (already loaded — saves setup time)

---

## Scores to Beat (Judges)

| Criterion | Weight | Our Target |
|---|---|---|
| Working prototype | 25 | Full workflow end-to-end |
| Technical depth | 20 | Clean algorithm + architecture diagram |
| AI/data approach | 15 | ETA model beats baseline (show MAE numbers) |
| Blood-system problem | 15 | Named user (blood bank officer), correct terminology |
| African conditions | 15 | Offline mode, mobile-first, power risk shown |
| Demo + readiness | 10 | ≤3min video recorded by 10:00 Wed |

---

*Keep this file accurate. The team reads it to know where to pick up.*
