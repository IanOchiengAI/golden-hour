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
| Ian Ochieng | Architect + ML | Full-stack, AI integration, agentic workflows | Now |
| Joronimo Amanya | The Engine | Rust, agentic & distributed systems | Now |
| Daniel Bitengo | Backend + Offline | Rust, TypeScript, distributed, offline-first sync | From ~19:00 EAT |
| Roland Sankara | TBD | *Skills not yet confirmed — ask ASAP* | Now |

---

## Session Log

| Timestamp (EAT) | Who | What |
|---|---|---|
| 2026-11-10 12:00 | Ian | Hackathon clock started. Project briefed. Architecture planned. .agents folder created. |

---

## What's Built ✅

- [x] `.agents/` folder with AGENTS.md, KNOWLEDGE.md, state.md, DECISIONS_LOG.md
- [x] `golden-hour-brief.html` — living brief with full problem breakdown (open in Edge)
- [ ] *(nothing else yet — build starts now)*

---

## In Progress 🔄

- [ ] GitHub repo creation
- [ ] Project folder scaffolding (backend/, frontend/)
- [ ] Data exploration / SQL schema verification

---

## Next Up 📋

**Hour 0–2 (by 14:00):**
1. Create GitHub repo → submit check-in form
2. Scaffold `backend/` (Python FastAPI or TypeScript Hono)
3. Scaffold `frontend/` (React + Tailwind)
4. Ian: load SQLite, verify data, start ETA feature engineering
5. Joronimo: implement ABO compatibility matrix + unit filter function
6. Roland: confirm skills → assigned to frontend or data

**Hour 2–5:**
7. Joronimo: cost function + scipy matching skeleton
8. Ian: train first ETA model, get baseline MAE
9. API: first endpoint `POST /dispatch/request` returns ranked units (mock ETA ok)
10. Frontend: request form connected to API

**By 19:00 (before Daniel arrives):**
- Working algorithm (Python): compatibility + matching + cold chain filter
- ETA model trained with numbers vs baseline
- API serving at least 1 real endpoint
- Frontend: request form + results view (even if basic)
- Architecture doc ready for Daniel handoff

---

## Open Blockers 🚧

- [ ] Roland's skills unknown — cannot assign module yet
- [ ] GitHub repo not created yet
- [ ] Tech stack final decision: FastAPI (Python) or Hono (TypeScript)?

---

## Architecture Decisions Made

| Decision | Choice | Reason | Date |
|---|---|---|---|
| DB | SQLite (provided) | Already there | 2026-11-10 |
| Matching | scipy.optimize.linear_sum_assignment | Hungarian algorithm, fast | 2026-11-10 |
| ETA | RandomForestRegressor (scikit-learn) | Fast to train, interpretable | 2026-11-10 |
| Maps | Leaflet.js | OSS, offline-capable | 2026-11-10 |
| Offline | PWA + Service Worker | African conditions requirement | 2026-11-10 |

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
