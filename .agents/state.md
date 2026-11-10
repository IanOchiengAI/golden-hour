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
| 2026-11-10 21:15–22:00 | Amanya | Frontend built on branch `amanya`: React 19 + TypeScript + Vite + Tailwind CSS. 6 core views wired: Clinician request form, Blood Bank Officer decision (with honest ETA range, 5m timer, Accept/Change/Reject), MoH authorisation tier, Supplying Lab dispatch (supplier-safe, no patient fields), Audit trail explorer (KDPA), and 47-facility stock readiness grid. Vite proxy configured to `http://localhost:8000`. Clean TypeScript build verified. |

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
- [x] Baseline vs model numbers confirmed: **Baseline 17.8 min MAE → Model 14.1 min MAE → 20.6% improvement**
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

- [x] **Frontend (`frontend/`, branch `amanya`)** — React + TypeScript + Vite + Tailwind CSS
  - Vite dev proxy configured to `http://localhost:8000` (no CORS issues)
  - Clinician request form with rapid presets (Maternity PPH, Trauma Uncrossmatched), compatibility preview, unknown blood group warning, and arrival temperature check (&gt;10°C excursion alert)
  - Blood Bank Officer Decision screen: calls `GET /requests/{id}/options`, displays honest ETA ranges (`low_min` - `high_min`), AI vs Fallback status banner, 5-minute escalation countdown, and mandatory Accept / Change (with reason) / Reject (with reason)
  - MoH Regional Authorisation screen: standing emergency oversight, urgent sign-off, emergency stop veto
  - Supplying Lab Officer station: supplier-safe view (strictly masks patient blood group and clinical notes per KDPA), packaging, transport mode selection (motorbike courier vs vehicle), release and transit update
  - Append-only audit trail timeline explorer (`GET /audit?request_id=`)
  - 47-facility readiness grid with power reliability and scarce O- stock indicators
  - African conditions support: 2G/3G low-data mode toggle and offline localStorage queue

---

## In Progress 🔄

- [ ] Connect live backend endpoints to frontend once backend server is booted locally
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

**Ian (`ml/`) — not edited by backend:**
- `ml/ranking.py` `compute_dispatch_score()` uses `date.today()` for days-to-expiry. It should use the data as-of date (`data_as_of: 2026-10-31` in `config/kenya.yaml`); today every unit looks ~10 days closer to expiry than the data says. Suggest an `as_of: date` parameter the backend can pass.
- `predict_eta()` still falls back silently. Backend works out `method` by calling `ml.predict._load_model()` itself (private function) — please return `method` from `predict_eta` so the backend can drop that.
- `rank_candidates` docstring still shows `patient_blood_group=` (not a parameter).
- Speed: model load ~5–9 s (backend warms it at server start); ~30 ms per site after. `predict_eta`/`explain_eta` open two SQLite connections per call. Backend sends only the 12 nearest sites (by route table) to `rank_candidates`.
- Possible model saturation: HSP-002 request got exactly 436.0 min ETA for five different sites (HSP-020/018/012/019, RBTC-ELD).

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
