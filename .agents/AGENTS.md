# Golden Hour — Agent Instructions

> You are working inside the **Golden Hour** project.
> Team Golden Hour · Terumo BCT Africa Hackathon 2026
> Challenge: **Emergency Request & Dispatch**
> Clock: Tue 10 Nov 12:00 → Wed 11 Nov 12:00 EAT
>
> **Read this entire file before touching any code.**

---

## Step 1 — Read the Project Brain (ALWAYS FIRST)

Before doing anything else, read:

```
F:\Work\Hackathon\Terumo BCT Hackathon\.agents\KNOWLEDGE.md
```

This contains:
- Blood domain rules (ABO compatibility, shelf lives, cold chain thresholds)
- Data schema quick-reference (all 11 tables)
- Architecture decisions already locked
- The scoring algorithm design
- African conditions constraints
- What the judges are looking for

**Apply everything in KNOWLEDGE.md without being asked.**

---

## Step 2 — Read the Project State

```
F:\Work\Hackathon\Terumo BCT Hackathon\.agents\state.md
```

This tells you:
- What is already built (do not rebuild it)
- What is in progress (coordinate, don't duplicate)
- What is next (pick up from here)
- Open blockers

---

## Step 3 — Understand the Team & Roles

| Person | Role | Module Ownership | Available |
|---|---|---|---|
| **Ian Ochieng** | Architect + ML | Algorithm design, ETA model, overall integration | Now |
| **Joronimo Amanya** | The Engine | Core matching algorithm, ABO rules, cold chain filter | Now |
| **Daniel Bitengo** | Backend + Offline | FastAPI/TypeScript API, offline-first PWA sync, audit trail | From 19:00 EAT |
| **Roland Sankara** | TBD | TBD pending skills confirmation | Now |

**Module boundaries are sacred.** Do not rewrite another person's module without noting it in `state.md` first.

---

## Step 4 — Understand the Architecture

```
F:\Work\Hackathon\Terumo BCT Hackathon\
├── .agents\                    ← You are here (agent context)
├── Terumo BCT Hackathon - Applicant's Kit\
│   └── Starter Dataset\        ← All CSVs + blood_system.sqlite
├── backend\                    ← Python FastAPI (or TypeScript Hono)
│   ├── algorithm\              ← Matching engine (Joronimo owns)
│   ├── ml\                     ← ETA model (Ian owns)
│   ├── api\                    ← REST endpoints (Daniel owns)
│   └── data\                   ← DB access layer
├── frontend\                   ← React + Tailwind (Roland/Ian)
│   ├── src\
│   │   ├── pages\
│   │   │   ├── EmergencyRequest.tsx
│   │   │   ├── DispatchResults.tsx
│   │   │   └── AuditLog.tsx
│   │   └── components\
└── golden-hour-brief.html      ← Living brief (open in Edge)
```

---

## Step 5 — What We Are Building

**One workflow, end to end:**

```
Hospital submits emergency request (component, blood group, urgency, units)
    ↓
System scans ALL 47 facilities for compatible units in stock
    ↓
Ranks options by: ETA (learned, not table) + compatibility + cold chain + expiry
    ↓
Blood bank officer sees top 3 options with honest ETA ± uncertainty
    ↓
Officer: Accept / Change / Reject  (mandatory human step)
    ↓
Dispatch confirmed → audit log entry created
```

**The AI feature (what beats the baseline):**
- Baseline: nearest site, exact blood group match, `routes.typical_travel_hours`
- Ours: all 47 sites, full compatibility rules, ML-predicted ETA from 35,181 historical transfers

---

## Step 6 — Non-Negotiable Rules

These are from the hackathon brief. Violating them disqualifies the submission:

- ❌ **Never** release a unit without officer Accept/Change/Reject
- ❌ **Never** let AI decide blood group compatibility — it enforces rules, humans decide
- ❌ **Never** present a prediction without uncertainty bounds (e.g. "2h ± 25min")
- ❌ **Never** dispatch a unit flagged with `temp_excursion_exposed = True` without officer override
- ❌ **Never** use real patient, donor, or facility data
- ✅ **Always** log who accepted/rejected/changed each dispatch recommendation
- ✅ **Always** show why the system made a recommendation (plain language explanation)
- ✅ **Always** provide a fallback if the ML model is offline (use `routes.typical_travel_hours`)

---

## Step 7 — Key Deadlines

| Time (EAT) | Action |
|---|---|
| **14:00 today** | Submit roster + GitHub repo link on check-in form |
| **15:00 today** | Blood-service Q&A (optional but high value) — same Meet link |
| **20:00 today** | Check-in 1: 2 lines on what works + what's blocking |
| **10:00 Wed** | Record demo video (do NOT leave this to the last minute) |
| **12:00 Wed** | Submissions close — no exceptions |

---

## Step 8 — End of Every Session (MANDATORY)

Before stopping work, update `state.md`:
1. Add a row to the Session Log with timestamp + 1-line summary
2. Update the "What's Built" section accurately
3. Update "In Progress" and "Next Up"
4. Note any blockers or decisions made

**The team reads state.md to know where to pick up. Keep it accurate.**

---

## Submission Checklist (track progress here)

- [ ] GitHub repo created and public
- [ ] Team roster submitted on check-in form (by 14:00)
- [ ] Working dispatch algorithm (compatibility + matching + ETA)
- [ ] ML ETA model trained and baseline numbers recorded
- [ ] Backend API endpoints working
- [ ] Frontend: request form working
- [ ] Frontend: results view with Accept/Change/Reject
- [ ] Frontend: mobile-responsive (test at 375px)
- [ ] Offline fallback implemented
- [ ] Audit log working
- [ ] Demo video recorded (≤ 3 min)
- [ ] README.md filled (from template)
- [ ] Architecture diagram in repo
- [ ] Baseline vs AI numbers in a table
- [ ] AI tools listed in README
- [ ] Submitted on submission form

---

*Golden Hour · Team of 4 · Kenya + Uganda · Terumo BCT Africa Hackathon 2026*
