# Team Golden Hour: Emergency Blood Request &amp; Intelligent Dispatch Copilot

**Terumo BCT Africa Hackathon 2026** · Challenge Area: **Emergency Request &amp; Dispatch**

[![Backend CI](https://img.shields.io/badge/Backend%20Tests-110%2F110%20Passing-brightgreen)]()
[![Model MAE](https://img.shields.io/badge/Emergency%20MAE-30.8%20min%20(-25.8%25)-blue)]()
[![Coverage](https://img.shields.io/badge/Conformal%20Coverage-91.1%25%20Emergency-emerald)]()
[![KDPA](https://img.shields.io/badge/KDPA%20Compliant-Section%2046%20Ground-purple)]()

---

## 1. The Problem

When a hospital experiences an acute haemorrhage or trauma case and exhausts its local blood reserves, a clinician or blood bank officer must urgently locate and secure compatible units across the country.

Today, this process relies on frantic, sequential phone calls to distant facilities, paper ledgers, and static distance tables:
- **Acute physiological window:** Severe post-partum haemorrhage (PPH) can prove fatal within 60 minutes—the clinical "Golden Hour". Today, median emergency resupply takes **5.2 hours**.
- **Unmet clinical need:** In the 1-year historical dataset across 47 facilities, **726 emergency requests (8.3%) went completely unfulfilled**, disproportionately impacting obstetric haemorrhage (238 requests) and road traffic trauma (240 requests).
- **The 41.5-minute blindspot:** Fixed travel lookup tables (`routes.typical_travel_hours`) are off by **41.5 minutes on average on emergency transfers** (and up to 158 minutes on unpaved roads), providing dangerous false confidence.
- **The spoilage vs safety paradox:** **23% of red cell units expire on shelves** due to lack of inter-facility visibility, while **2,119 units** were historically transfused after undetected cold-chain breaches (2–6°C excursion).
- **Universal donor depletion:** O− blood faces a catastrophic **47.4% unmet rate** nationally, with only **7 units of safe O− RBC in stock** across all 47 facilities. Naive "nearest hospital" searches burn rare universal donor stock for patients who could safely receive O+ or B+.

---

## 2. What We Built

**Golden Hour** is an intelligent, human-in-the-loop emergency blood dispatch copilot that scans all 47 facilities in real time, ranks compatible donor units using multi-criteria optimization, predicts realistic transit times with calibrated uncertainty bounds, and enforces a mandatory clinical governance gate.

### What Works Now:
1. **Biological Compatibility Engine:** Full ABO/RhD compatibility rules (RBC universal O−, reversed plasma compatibility for FFP, strict matching for PLT). Unknown blood group protocol surfaces O− universal donor with critical clinical warnings.
2. **Cold-Chain & Excursion Isolation:** Automatically screens every unit; 100% quarantines units flagged with `temp_excursion_exposed = 1` or unverified screening status.
3. **Multi-Criteria Optimization:** Scores eligible candidates using a joint cost function:
   $$\text{Cost} = (0.50 \times \text{ETA}_{\text{norm}}) + (0.30 \times \text{Scarcity}) + (0.20 \times \text{ExpiryPenalty})$$
   - **50% Travel ETA:** Minimizes physiological transit time.
   - **30% Scarcity Penalty:** Prevents burning critically rare blood reserves (O−) when compatible alternatives exist.
   - **20% FEFO Urgency:** Prioritizes units nearing expiration (First-Expired, First-Out) to curb the 23% national spoilage rate.
4. **Calibrated ML ETA Model:** Random Forest regressor trained on 34,135 transfers with emergency weighting and conformal prediction intervals ensuring **91.1% of emergency trips land inside the stated arrival window**.
5. **Human Clinical Copilot (Mandatory Gate):** The Blood Bank Officer has final decision authority with explicit **Accept / Change (with reason) / Reject (with reason)** actions. No unit is ever moved autonomously by AI.
6. **Tiered MoH Authorisation:** Config-driven governance (`kenya.yaml`) supporting standing approval for acute emergencies with MoH notification, or mandatory MoH pre-authorisation for cross-county transfers.
7. **KDPA Privacy Compliance:** Supplying labs see a supplier-safe dispatch view strictly masking patient blood group and clinical notes (Section 46 health data ground).
8. **African Conditions Support:** Offline-first PWA outbox with idempotency (`client_request_id`), mobile-first responsive layout (375px handhelds), grid reliability scoring for low-power hubs, and transport mode selection (motorbike courier vs ambulance).
9. **Full Auditability:** Append-only `AuditEvent` log tracking `who · role · action · before · after · reason · timestamp`.

### What is Mocked or Next Steps:
- Direct hardware SMS/USSD bidirectional gateway (architecture designed; currently simulated via web interface and terminal scripts).
- Reverse logistics automated scheduling for empty cool boxes.

---

## 3. Demo & Video

- **Demo Video (≤ 3 minutes):** [Link to Demo Video on Loom / YouTube]
- **Live Interactive Demo:** [http://localhost:5173 / Deployed Instance]
- **Demo Credentials:** (Password for all: `demo2026`)
  - Clinician: `clinician@goldenhour.health`
  - Blood Bank Officer: `officer@goldenhour.health`
  - Backup Officer (Escalation): `backup.officer@goldenhour.health`
  - Ministry of Health: `moh@goldenhour.health`
  - Supplying Lab: `lab@goldenhour.health` (or `lab.<facility_id>@goldenhour.health`)

---

## 4. Architecture & System Flow

![Golden Hour Architecture](docs/architecture.svg)

### Standards Alignment:
- **HL7 FHIR R4:** Mapped to `ServiceRequest` (emergency blood requisition), `BloodProduct` (unit tracking, shelf life, cold chain state), and `Location` (facilities, power grid reliability). Detailed in `docs/data-model.md`.
- **ISBT 128:** Full barcode compatibility for donation identification numbers and component product codes.
- **Kenya Data Protection Act (KDPA):** Privacy by design—clinician notes are never leaked across county boundaries to logistics contractors; officer actions are audited to an append-only log.

---

## 5. AI and Data Performance

### Baseline vs Golden Hour ML Model
We evaluated the ML model against the naive baseline used in production today: static route lookup tables (`routes.typical_travel_hours`) with single-facility nearest-neighbor matching.

| Metric | Baseline (Route Table) | Golden Hour ML | Improvement |
|---|---|---|---|
| **MAE — Emergency Transfers** | **41.5 min** | **30.8 min** | **25.8% Lower Error** |
| MAE — All Transfers (34,135) | 18.3 min | 14.5 min | 20.7% Lower Error |
| **ETA Interval Coverage (Emergencies)** | — | **91.1%** | **Target ≥ 90% Met ✅** |
| ETA Interval Coverage (All) | — | 96.2% | Calibrated safety margin |
| Training Dataset | — | 34,135 transfers | 60 / 20 / 20 Train/Calib/Test |

> **Key Pitch Takeaway:**
> On actual emergency blood transfers, the fixed route table is off by **41.5 minutes** on average. Golden Hour cuts that error to **30.8 minutes**—a **25.8% accuracy leap**—with **91% of real deliveries arriving within our stated arrival window**.

### How the Model Works:
- **Algorithm:** Random Forest Regressor (scikit-learn 1.9.1, 200 trees, `n_jobs=1` optimized inference).
- **Sample Weights:** Emergency transfers are weighted 3× and urgent transfers 2× during training so the loss function prioritizes life-saving routes.
- **Features Used:** Road distance (`road_km`), road surface quality (`good`/`fair`/`poor`), transport mode (`vehicle`/`motorbike`/`PSV`), hour of day, day of week, and destination telecom connectivity (`4G`/`3G`/`2G`). *Zero patient or donor data is fed to the model.*
- **Conformal Prediction Intervals:** Calibrated on a held-out set of emergency & urgent deliveries ($n=1,028$) to guarantee statistically sound $[low, high]$ minutes.
- **Graceful Fallback:** If the model pickle is offline or unreadable, the system automatically falls back to `routes.typical_travel_hours ± 20%`, sets `eta_method = "fallback"`, and surfaces an "AI Offline" warning on the officer terminal.

---

## 6. How to Run It (Under 10 Minutes)

### Prerequisites:
- Python 3.11+ (tested on Python 3.13)
- Node.js 18+ and npm
- Git

### 1. Backend Setup (Django + DRF)
```bash
# Clone the repository
git clone https://github.com/IanOchiengAI/golden-hour.git
cd golden-hour/backend

# Create virtual environment & install pinned dependencies
python -m venv .venv
# Windows:
.\.venv\Scripts\Activate.ps1
# Linux / macOS:
# source .venv/bin/activate

pip install -r requirements.txt

# Database setup (starter dataset blood_system.sqlite is included)
python manage.py migrate
python manage.py seed_demo_users

# Start API server on port 8000
python manage.py runserver 8000
```

### 2. Frontend Setup (React + Vite + Tailwind)
In a second terminal:
```bash
cd golden-hour/frontend
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser. (The Vite proxy automatically forwards `/requests`, `/dispatches`, `/auth`, and `/audit` to `http://localhost:8000`).

### 3. Run Automated Tests & E2E Verification
In a third terminal:
```bash
# Run all 110 Django backend tests:
cd golden-hour/backend
python manage.py test

# Run the complete black-box End-to-End API flow (raised → received):
cd ..
python docs/e2e_test.py
# Or run the CLI walkthrough simulation:
python backend/scripts/try_flow.py --urgency life_threatening
```

---

## 7. African Conditions Engineering

| African Condition | Our Engineering Response |
|---|---|
| **Intermittent 2G/3G Connectivity** | Offline-first PWA outbox (`frontend/src/offline/`). Requests are queued locally in IndexedDB/localStorage with UUID `client_request_id`; idempotent retries prevent duplicate requests over spotty links. |
| **Frequent Power Grid Outages** | Displays live facility `grid_reliability` scores and backup generator flags; facilities suffering power failure are down-weighted to prevent dispatching compromised cold stock. |
| **Road Quality & Modality** | Explicitly models poor unpaved roads and motorbike couriers (boda-boda), which can navigate rural terrain faster than standard hospital ambulances. |
| **Low-End Handhelds** | Mobile-first UI optimized for 375px viewport, ultra-fast initial bundle, zero heavy UI frameworks, high-contrast accessible color tokens. |
| **Multi-Country Scaling** | Fully configuration-driven (`config/kenya.yaml`). Regional parameters, blood group prevalence, escalation timeouts, and authorisation tiers can be switched via the `COUNTRY_CONFIG` environment variable without code changes. |

---

## 8. AI Tools We Used

- **Google Antigravity & Gemini 3.8:** Used for multi-criteria algorithm design, conformal interval calibration, system architecture synthesis, and exploratory data analysis.
- **Claude Sonnet 4.6 (Anthropic):** Used for DRF API view scaffolding, automated test suite construction (110 tests), and React component wiring.

---

## 9. Team Golden Hour

| Name | Role | Country | Presenting Friday |
|---|---|---|---|
| **Ian Ochieng** | AI & Algorithm Architect | Kenya | In Person (Nairobi) |
| **Joronimo Amanya** | Frontend Lead · Mobile PWA & UI/UX | Uganda | Online |
| **Roland Sankara** | Team Lead � Backend Lead · Django API & Security | Uganda | Online |
| **Daniel Bitengo** | Architecture, Offline Sync & QA Lead | Kenya | In Person (Nairobi) |

---

## 10. Known Limits & Next Steps
1. **Multi-hop Inter-Facility Transfers:** Current release handles point-to-point dispatch. Next version will support multi-leg transit chains ($A \rightarrow B \rightarrow C$).
2. **IoT BLE Cold Box Telemetry:** Integration with low-cost Bluetooth temperature data loggers for live en-route cold-chain monitoring.
3. **Automated Reverse Logistics:** Tracking return journeys of certified blood carrier boxes to blood transfusion satellites.
