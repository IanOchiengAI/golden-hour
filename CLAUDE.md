# Golden Hour — Context for Claude Code

Team Golden Hour · Terumo BCT Africa Hackathon 2026 · Challenge: **Emergency request and dispatch**
Build window: Tue 10 Nov 12:00 → Wed 11 Nov 12:00 EAT. All code must be written in this window.

## Read these first

@.agents/KNOWLEDGE.md
@.agents/state.md
@docs/TARGET_SUBMISSION_SPEC.md

`.agents/AGENTS.md` is older. **Where it disagrees with this file, this file wins.** Its Windows paths (`F:\Work\...`), its role table and its FastAPI/Hono stack are out of date.

## Current team and ownership

| Person | Owns | Do not change without telling them |
|---|---|---|
| Roland Sankara | Backend: Django + DRF API, rules engine (ABO/RhD compatibility, unit filters), request status flow, authorisation tiers, auto-hold, escalation timers, audit log, Africa's Talking SMS, integration | `backend/` |
| Ian Ochieng | Data + AI: `ml/` (ETA model, `predict_eta`, `rank_candidates`), baseline numbers, readiness query | `ml/` |
| Joronimo Amanya | Frontend: clinician form, blood bank officer screen (Accept / Change / Reject), MoH authorising officer screen, supplying lab screen, status tracking, readiness map | `frontend/` |
| Daniel Bitengo | Architecture diagram, data model + FHIR / ISBT 128 / DHIS2 mapping, `config/kenya.yaml`, deployment, README, slides, demo video, security scans | `docs/`, `config/`, README |

## Stack (decided)

- Backend: Python 3.11, Django + Django REST Framework, in `backend/`
- Database: the provided SQLite file `Terumo BCT Hackathon - Applicant_s Kit/Starter Dataset/blood_system.sqlite` (PostgreSQL is the production target, shown only in the architecture diagram)
- ML: scikit-learn **1.9.1 exactly** (the saved `ml/eta_model.pkl` needs it), pandas, numpy. Keep `requirements.txt` pinned.
- Frontend: React + Vite in `frontend/` (UI library is Amanya's choice)
- SMS: Africa's Talking sandbox
- Country rules: `config/kenya.yaml` (plus one sample second country). Rules change by settings, not code.

## The workflow (in build order)

1. Clinician raises a request: patient ABO/RhD, product, units, clinical urgency (life-threatening, urgent, routine).
2. Rules engine (fixed code, never AI): compatible groups from the ABO/RhD table; remove expired, quarantined, untested and temperature-excursion units; only facilities with enough units (or mark as partial).
3. `ml.ranking.rank_candidates()` ranks eligible sites with ETA range (low, mid, high) and a plain-language reason.
4. **Auto-hold**: units at the top-ranked site are reserved immediately; the hold moves with a Change and is released on Reject.
5. Blood bank officer: Accept / Change / Reject (one screen, top choice pre-selected). 5-minute escalation timer to a backup officer.
6. **Authorisation tier** (from `config/kenya.yaml`, setting `emergency_authorisation: standing | per_transfer`):
   - Life-threatening + `standing`: proceeds under the Ministry of Health's standing regional authorisation; MoH officer notified instantly, can stop it, reviews it afterwards.
   - Urgent or routine (or `per_transfer`): MoH authorising officer approves before dispatch, with an escalation timer.
7. Supplying lab officer confirms release. If declined: log reason, release hold, auto-hold and offer the next-ranked site.
8. Status: dispatched → in transit → received, with SMS updates from approved templates only.
9. Every step writes an AuditEvent (who, role, action, before, after, reason, time).

Status lifecycle: `Raised → Matching → UnitsHeld → AwaitingDecision (→ Escalated) → AwaitingAuthorisation (or straight on under standing authorisation) → SentToSupplier → Dispatched → InTransit → Received`, plus `HandledManually` on Reject / not approved, and `DraftFromCall → Raised` for voice requests.

## API contract

| Method | Endpoint | Caller |
|---|---|---|
| POST | `/requests` | Clinician |
| GET | `/requests/{id}/options` | Blood bank officer — returns ranked sites, ETA range, `method` (`model` or `fallback`), reason |
| POST | `/requests/{id}/decision` | Blood bank officer — accept, change or reject, with reason |
| POST | `/requests/{id}/authorise` | MoH authorising officer — approve or reject, with reason |
| POST | `/dispatches/{id}/release` | Supplying lab officer — confirm or decline |
| POST | `/dispatches/{id}/status` | Dispatched, in transit, received |
| GET | `/audit?request_id=` | Demo / judges |
| GET | `/readiness` | Manager (add-on) |

## Known issues in `ml/` to fix (Ian)

1. **Ranking undervalues arrival time.** ETA is divided by 720 min, so expiry and scarcity outweigh it: a site 240 min away (unit expiring in 3 days) scores better than one 30 min away. Fix: first keep only sites within the urgency's target time (from config) or within ~15 min of the fastest site, then use scarcity and expiry to choose among them.
2. The `rank_candidates` docstring passes `patient_blood_group=`, which is not a parameter. Compatibility is filtered by the backend before calling it.
3. `predict_eta()` falls back silently. It must also report `method = "model" | "fallback"` so the UI can show the "AI offline" banner.
4. Report interval coverage: % of real test deliveries inside (low, high). Widen the range if well under 90%.

## Rules that must never be broken

- AI never decides compatibility, releases a unit, overrides a lab result or quarantine, or ranks patients on anything but clinical urgency.
- Every move of blood needs a human Accept / Change / Reject, and the release is confirmed by a qualified lab officer.
- Every prediction shows its range. The workflow still works when the model is offline.
- No SMS is sent unless its template was approved.
- Supplying facilities never see patient details. Model and analytics use no patient fields.
- Never use real donor, patient or facility data.

## Add-ons (only after the Tue 22:00 gate passes)

- SMS alerts and "reply 1 to accept" (Africa's Talking)
- Readiness map: per hospital × blood group, green / amber / red from fastest predicted arrival vs target
- Voice request: uploaded recording of a synthetic call → transcription → draft request; officer confirms every field (each field shows its source words); fallback is typing it in. Live call bridging is pitch-only.
- Optional `GET /fhir/ServiceRequest/{id}` export. No FHIR server.

## Security (build, not just document)

Token login per user, role check on every endpoint, input validation, rate limiting on login and SMS endpoints, secrets in environment variables, HTTPS on the live link, audit of logins and failed access. Daniel runs OWASP ZAP + Bandit on Wednesday morning.

## Working rules

- Work on your own branch; merge to `main` at each checkpoint. Small commits with clear messages.
- Explain every change so its owner can present it to the judges.
- At the end of every session, update `.agents/state.md` (session log, what's built, next up, blockers).
- List AI tools used (Claude Code, etc.) and what for in the README.
