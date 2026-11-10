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

---

## In Progress 🔄

- [ ] Tech stack final decision (Django vs FastAPI, PostgreSQL vs SQLite) — decide at 16:30
- [ ] Backend scaffold (Roland)
- [ ] Frontend scaffold (Amanya)
- [ ] Data exploration / ETA model (Ian)

---

## Next Up 📋

**By 16:30 — Decide before writing a single line of code:**
1. Django or FastAPI? (Roland decides)
2. PostgreSQL or SQLite? (SQLite is already loaded with data — saves 1–2 hours)
3. Tailwind or Mantine UI? (Amanya decides)
4. Everyone commits to their branch; merge to main at each checkpoint

**By 19:00 (before Daniel arrives):**
- Working algorithm: ABO compatibility + unit filter + cold chain check
- ETA model trained, baseline MAE vs model MAE recorded
- API: at least `POST /requests` and `GET /requests/{id}/options` returning real data
- Frontend: request form + results view (Accept / Change / Reject visible)
- Architecture doc ready for Daniel handoff

**By Tue 22:00 gate:**
- Dispatch flow end-to-end (or stop all add-ons and fix it)

---

## Open Blockers 🚧

- [ ] **Tech stack not decided** — Django vs FastAPI, PostgreSQL vs SQLite (resolve at 16:30)
- [ ] **Roland's preferred stack** — Django confirmed in team plan, but not verbally agreed yet
- [ ] **Daniel not yet online** — joins ~19:00; needs handoff doc ready

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
