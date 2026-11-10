# Golden Hour — Decisions Log

> Immutable record of architecture and design decisions.
> **Never edit or delete an existing entry. Only append.**
> These are the invariants. Do not revert them without explicit team agreement.

---

## Section 1 — Permanent Rules (Invariants)

These are locked. Do not change without whole-team agreement.

| Rule | Reason |
|---|---|
| Use `facility_id` as truth, never `facility_name_raw` | 14% of requests have messy names |
| Never dispatch `temp_excursion_exposed = True` without officer override | Safety — 2,119 silent excursions already in data |
| Always show ETA with ± uncertainty | Hackathon brief requirement: "never present a guess as a fact" |
| Always require Accept/Change/Reject before dispatch | Hackathon brief: mandatory human step |
| Use FEFO (First-Expired-First-Out) in ranking | Reduces waste while serving requests |
| SQLite as the database (the provided file) | Speed, no setup, all data already there |
| Fallback: `routes.typical_travel_hours` when ML is offline | Workflow must work without AI |

---

## Section 2 — Change Log

### 2026-11-10 12:00 EAT — Session 1 (Ian)

**Project kickoff. Architecture planned.**

- Created `.agents/` folder with full context for all agents and team members
- Decided on Python FastAPI for backend (fastest for data/ML in 24hrs)
- Decided on React + Tailwind for frontend (mobile-first, fast iteration)
- Decided on scipy.optimize.linear_sum_assignment for matching (Hungarian, 3 lines of code)
- Decided on RandomForestRegressor for ETA (trains in <2min, no GPU)
- Decided on Leaflet.js for maps (OSS, offline-capable)
- Decided on PWA + Service Worker for offline mode (African conditions)
- Challenge area confirmed: **Emergency Request & Dispatch**
- Team name confirmed: **Golden Hour**
- Daniel available from 19:00 — architecture handoff doc needed by then

**Files created:**
- `.agents/AGENTS.md`
- `.agents/KNOWLEDGE.md`
- `.agents/state.md`
- `.agents/DECISIONS_LOG.md`
- `golden-hour-brief.html` (living brief, 98KB interactive HTML)

---

## Section 3 — Rejected Options

| Option | Rejected In Favour Of | Reason |
|---|---|---|
| Rust for backend | Python FastAPI | Rust compile times too slow for 24hr hackathon |
| PostgreSQL | SQLite (provided) | SQLite is already there with all data |
| Full dashboard | Single dispatch workflow | Scope creep kills hackathons — judges want depth not breadth |
| Exact blood group match only | Full ABO compatibility rules | Exact match misses compatible O− units sitting unused |

---

*Append only. Never edit existing entries.*
