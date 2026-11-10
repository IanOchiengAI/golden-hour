# Golden Hour — Backend

> Python backend for the Golden Hour emergency blood dispatch system.

## Structure

```
backend/
├── algorithm/
│   ├── abo.py        # ABO/plasma compatibility rules (Joronimo)
│   └── matcher.py    # Multi-criteria dispatch ranking engine (Joronimo)
├── api/
│   └── routes/       # FastAPI/Django route handlers (Roland)
├── data/
│   └── database.py   # SQLite connection factory
├── ml/
│   └── eta_model.py  # Random Forest ETA predictor (Ian) — 20.6% MAE improvement
└── requirements.txt
```

## Quickstart

```bash
pip install -r requirements.txt
```

## Key interfaces

### `algorithm.abo`
```python
from algorithm.abo import compatible_donor_groups, is_compatible
groups = compatible_donor_groups("A+", "RBC")  # → ["A+", "A-", "O+", "O-"]
```

### `ml.eta_model` (Roland imports this)
```python
from ml.predict import predict_eta
low, mid, high = predict_eta(source_facility_id, dest_facility_id, datetime.now())
# Returns (low, mid, high) in minutes — always. Falls back to table if model offline.
```

### `algorithm.matcher`
```python
from algorithm.matcher import rank_options
options = rank_options(request_id, db_conn)  # → List[DispatchOption] top-3
```

## Fallback guarantee
If `eta_model.pkl` is missing or throws, `predict_eta()` **always** falls back to `routes.typical_travel_hours`. The API will never 500 on a missing model file.
