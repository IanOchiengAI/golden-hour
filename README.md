# Team Golden Hour: Emergency Blood Request & Dispatch Copilot

Terumo BCT Africa Hackathon 2026 · Challenge area: Emergency Request and Dispatch

---

## The Problem
When a hospital experiences an emergency (such as severe obstetric haemorrhage or road traffic trauma) and exhausts its local stock, staff must quickly secure compatible blood units.

Today, this process is high-friction:
- Emergency requests take a median of **65 minutes**, with many waiting multiple hours—risking the patient's critical "Golden Hour".
- In the provided dataset, **726 emergency requests (8.3%)** went unfulfilled.
- Systemic route travel tables underestimate actual transfer duration by **~20%** (2.44h table vs. 2.93h empirical reality).
- Over 2,000 units in the dataset were transfused after undetected cold-chain breaches.

## What We Are Building
A real-time dispatch copilot that matches acute hospital needs with compatible units across all 47 facilities, predicts honest ETAs with confidence intervals, and enforces a mandatory clinical sign-off (Accept / Change / Reject).

### Current Status (Kickoff / Check-in 1):
- **What works now:**
  - Repository scaffolded and live.
  - Initial dataset exploration complete (identified key bottlenecks in emergency fulfillment, route times, and cold-chain logs).
  - System architecture, ABO compatibility matrix rules, and scoring algorithm designed.
  - Interactive mission brief (`golden-hour-brief.html`).
- **What is in progress / planned for the 24-hour sprint:**
  - [ ] Core matching algorithm implementation (SciPy linear sum assignment + ABO logic).
  - [ ] ML-based ETA regression model trained on historical transfer logs with uncertainty bounds.
  - [ ] Cold-chain excursion filter and facility reliability scoring.
  - [ ] FastAPI backend endpoints for request submission, dispatch recommendations, and audit logging.
  - [ ] Mobile-responsive frontend with mandatory Accept/Change/Reject decision step.
  - [ ] Offline caching layer for low-connectivity environments.

Demo video: [To be recorded by 10:00 Wed]  
Live demo: [To be deployed during technical sprint]

## Planned Architecture
1. **Frontend:** Mobile-first web app (React + Tailwind) with offline sync support.
2. **Backend API:** Python FastAPI serving dispatch recommendations and logging audit trails.
3. **Dispatch Engine:** Multi-criteria cost optimization considering travel ETA, blood group scarcity (protecting O−), and shelf-life expiration (FEFO).
4. **AI/ML Component:** Travel time regressor (Random Forest) comparing predicted transfer hours against the baseline route lookup table (`routes.typical_travel_hours`).

## Team
| Name | Role | Country |
|------|------|---------|
| Ian Ochieng | Lead Architect & ML | Kenya |
| Joronimo Amanya | The Engine (Matching Logic) | Uganda |
| Daniel Bitengo | Backend & Offline Sync | Kenya |
| Roland Sankara | Data & Documentation | Uganda |

*(Note: Detailed target submission specification is maintained in `docs/TARGET_SUBMISSION_SPEC.md` and will be updated as modules are delivered).*
