# Team Golden Hour: Emergency Blood Request & Intelligent Dispatch Copilot

Terumo BCT Africa Hackathon 2026 · Challenge area: Emergency Request and Dispatch

---

## The problem
When a hospital experiences an acute haemorrhage or trauma case and exhausts local blood reserves, a hospital blood bank officer or clinician must urgently secure compatible blood units.

Today, this process relies on fragmented, sequential phone calls to nearby facilities, manual registers, and static route estimates:
- **Median emergency wait is 65 minutes**, with average waits stretching to **128 minutes** and worst cases exceeding **23 hours**—far exceeding the physiological 60-minute "Golden Hour".
- In the provided year-long dataset across 47 facilities, **726 emergency requests (8.3%) went completely unfulfilled**, disproportionately hitting road traffic trauma (240 requests) and obstetric haemorrhage (238 requests).
- **Static lookup tables underestimate travel time by 20%** (2.44h table average vs. 2.93h empirical average), giving dispatchers false confidence.
- **2,119 units** were transfused after undetected cold-chain excursions (2–6°C breach), while 7,173 units expired on shelves due to lack of visibility.

## What we built
An intelligent, human-in-the-loop dispatch system that scans all 47 facilities in real time, ranks compatible donor units using multi-criteria optimization, predicts realistic travel times via calibrated ML, and enforces a mandatory clinical sign-off gate.

- **What works now:**
  - Multi-facility stock visibility and ABO/Rh biological compatibility rules (including O− universal donor logic for unknown blood groups).
  - Multi-criteria dispatch scoring balancing transit ETA, blood group scarcity penalties (conserving rare groups), and FEFO (First-Expired, First-Out) shelf-life preservation.
  - ML-driven ETA regression trained on 35,181 historical transfers with calibrated ± uncertainty bounds.
  - Cold-chain integrity filter automatically isolating units flagged with temperature excursions.
  - Human clinical copilot: Mandatory **Accept / Change / Reject** workflow with immutable audit logging.
  - Offline-first cached stock visibility for low-connectivity environments (2G/3G).
- **What is mocked or not finished:**
  - Direct SMS/USSD bidirectional gateway (currently simulated via web interface).
  - Live GPS tracker hardware integration (utilizing road network graph model).

Demo video (3 minutes or less): [Coming soon - recording by 10:00 Wed]  
Live demo: [Deploying] · Test log-in: `officer@goldenhour.health` / `demo2026`

## How to run it
Step-by-step commands (tested on Python 3.10+ and Node 18+):

### 1. Clone & Set Up Backend
```bash
git clone https://github.com/IanOchiengAI/golden-hour.git
cd golden-hour/backend
pip install -r requirements.txt
python -m ml.train            # Trains ETA regressor on historical transfers
python run.py                 # Starts API server on port 8000
```

### 2. Set Up Frontend
```bash
cd ../frontend
npm install
npm run dev                   # Starts dev server on port 5173
```
Open `http://localhost:5173` in any browser.

## Architecture
See `docs/architecture.png` and `golden-hour-brief.html`.

- **Frontend Client:** React + TypeScript + Tailwind CSS (mobile-responsive for 375px handhelds, PWA service-worker cache).
- **API & Dispatch Engine:** Python FastAPI with SciPy bipartite linear sum assignment optimization and SQLite/in-memory data layer.
- **ML Engine:** Scikit-learn Random Forest Regressor trained on 35,181 transfer logs predicting transfer duration based on road quality, transit mode, time-of-day, and destination connectivity.
- **Standards Alignment:**
  - **HL7 FHIR R4:** Mapped to `BloodProduct`, `ServiceRequest`, and `Location` resources.
  - **ISBT 128:** Compatible with international transfusion barcoding standards.

## AI and data
- **What the AI feature does:** Predicts realistic transfer transit duration (with explicit ± standard deviation uncertainty bounds) instead of theoretical speed table lookups, and ranks candidates using a joint cost function:
  $$\text{Cost} = w_1 \cdot \widehat{\text{ETA}} + w_2 \cdot \text{Scarcity} + w_3 \cdot \text{Expiry}$$
- **Baseline we compared against:** Static route lookup table (`routes.typical_travel_hours`) matching only the nearest single facility and exact blood group.
- **Result:**
  - Baseline route lookup Mean Absolute Error (MAE): ~0.84 hours.
  - Golden Hour ML Regressor MAE: significantly lower, accounting for transport mode (motorbike vs. vehicle) and destination infrastructure.
  - Replay simulation shows average emergency transit reduction and 100% quarantine of 2,119 excursion-compromised units.
- **How a user sees the reason for a recommendation:** Plain-language rationale explaining compatibility, road quality, transit mode, remaining shelf life, and cold-chain safety.
- **Who approves it:** The Blood Bank Officer has final authority with explicit **Accept / Change / Reject** actions.
- **What happens if the AI is wrong or offline:** Automatic graceful fallback to standard `routes.typical_travel_hours` table lookups with clear visual offline badges.

## Data
Synthetic starter dataset (November 2025 – October 2026): 47 facilities, 43,363 donors, 49,426 blood units, 17,430 requests, 35,181 transfers, 399,280 temperature logs, and 2,609 power outages. No real patient, donor, or facility data is used.

## African conditions
- **Low Connectivity:** Offline-first PWA caching; minimal payload design; works across 2G/3G mobile data.
- **Unreliable Grid:** Integrates facility backup power availability and grid reliability into dispatch confidence scoring.
- **Transport Modality:** Explicitly accounts for motorbike courier dispatch alongside standard ambulance/vehicle transport.
- **Multi-Country Extensibility:** Configuration-driven county/regional definitions, facility levels, and blood group prevalence tables.

## AI tools we used
- Claude / Gemini (via Antigravity): Code scaffolding, architecture refinement, exploratory data analysis scripts.

## Team
| Name | Role | Country | Presenting Friday |
|------|------|---------|-------------------|
| Ian Ochieng | Lead Architect & ML Integration | Kenya | In Person (Nairobi) |
| Joronimo Amanya | The Engine (Matching & Domain Logic) | Uganda | Online |
| Daniel Bitengo | Backend & Offline-First Sync | Kenya | In Person (Nairobi) |
| Roland Sankara | Data & Documentation Lead | Uganda | Online |

## Known limits and next steps
- Multi-leg inter-facility transfer chains (A -> B -> C) currently require sequential confirmation.
- Integration with live cold-box IoT BLE temperature loggers for real-time en-route temperature telemetry.
- Automated reverse-logistics for empty cool boxes and blood carrier packs.
