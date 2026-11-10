"""
Golden Hour — ETA Model Training
=================================
Trains a Random Forest on 34,135 historical blood transfers to predict
arrival time as a (low, mid, high) range in minutes.

Beats the baseline (routes.typical_travel_hours table lookup) by learning
patterns the fixed table cannot see: road degradation, transport mode,
time of day, and connectivity at the destination.

Interval calibration (conformal prediction):
  The raw RF tree spread gives only ~19% coverage — far too narrow.
  We hold out a calibration set, compute signed residuals
  (actual − predicted) on it, then store the 5th/95th percentile of
  those residuals. At inference time we add them to the point estimate
  to produce intervals that actually cover ~90% of real outcomes.

Run this once:
    python -m ml.train_eta

Output:
    ml/eta_model.pkl        — saved model (loaded by predict.py)
    prints baseline vs model MAE + coverage for the README
"""

import os
import pickle
import sqlite3
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

# ── Paths ────────────────────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
DB_PATH = os.path.join(
    _ROOT,
    "Terumo BCT Hackathon - Applicant_s Kit",
    "Starter Dataset",
    "blood_system.sqlite",
)
MODEL_PATH = os.path.join(_HERE, "eta_model.pkl")

# ── Encodings (must match predict.py exactly) ─────────────────────────────
ROAD_QUALITY_ENC   = {"good": 0, "fair": 1, "poor": 2}
TRANSPORT_MODE_ENC = {"vehicle": 0, "motorbike": 1, "public_service_vehicle": 2}
CONNECTIVITY_ENC   = {"4G": 0, "3G": 1, "2G": 2}

FEATURE_COLS = [
    "road_km",
    "road_quality_enc",
    "transport_mode_enc",
    "hour_of_day",
    "day_of_week",
    "connectivity_enc",
]


# ── Data loading & cleaning ───────────────────────────────────────────────
def load_training_data() -> pd.DataFrame:
    """
    Load and clean the transfers table joined with routes, facilities, and requests.

    Cleaning rules applied here (see KNOWLEDGE.md §8a for full reasoning):
    - Drop transfers with no received_at (~3%): cannot compute actual duration
    - Drop durations ≤5 min or >48 h: data entry errors / extreme outliers
    - Drop rows with no matching route: cannot compute road features

    We also join requests to get urgency, which is used to:
    1. Weight emergency/urgent transfers more heavily during training
    2. Calibrate conformal intervals on emergency transfers only
       (they have higher variance — calibrating on them guarantees coverage
       where it matters most)
    """
    conn = sqlite3.connect(DB_PATH)

    df = pd.read_sql(
        """
        SELECT
            t.transport_mode,
            t.dispatched_at,
            r.road_km,
            r.road_quality,
            r.typical_travel_hours,
            f.connectivity,
            COALESCE(req.urgency, 'routine') AS urgency,
            (julianday(t.received_at) - julianday(t.dispatched_at))
                * 24 * 60 AS actual_minutes
        FROM transfers t
        JOIN routes r
            ON t.from_facility_id = r.from_facility_id
           AND t.to_facility_id   = r.to_facility_id
        JOIN facilities f
            ON t.to_facility_id = f.facility_id
        LEFT JOIN requests req
            ON t.request_id = req.request_id
        WHERE t.received_at   IS NOT NULL
          AND t.dispatched_at IS NOT NULL
        """,
        conn,
    )
    conn.close()

    # Duration sanity filter
    df = df[(df["actual_minutes"] > 5) & (df["actual_minutes"] <= 2880)].copy()

    # Feature engineering
    df["dispatched_dt"]     = pd.to_datetime(df["dispatched_at"])
    df["hour_of_day"]       = df["dispatched_dt"].dt.hour
    df["day_of_week"]       = df["dispatched_dt"].dt.dayofweek

    df["road_quality_enc"]   = df["road_quality"].map(ROAD_QUALITY_ENC).fillna(1)
    df["transport_mode_enc"] = df["transport_mode"].map(TRANSPORT_MODE_ENC).fillna(0)
    df["connectivity_enc"]   = df["connectivity"].map(CONNECTIVITY_ENC).fillna(1)

    return df


# ── Training ──────────────────────────────────────────────────────────────
def train() -> dict:
    """
    Train the ETA model and save it to disk.

    Split strategy (3-way):
      60% train  — model fitting
      20% calib  — conformal interval calibration (never seen by the model)
      20% test   — final honest evaluation

    Returns a dict of evaluation metrics.
    """
    print("Loading training data...")
    df = load_training_data()
    print(f"  {len(df):,} clean records")

    X = df[FEATURE_COLS].values
    y = df["actual_minutes"].values
    baseline_col = df["typical_travel_hours"].values * 60  # minutes
    urgency_col  = df["urgency"].values

    # ── 3-way split: 60 / 20 / 20 ────────────────────────────────────────
    # First cut off 40% for calib+test, then split that in half.
    (X_train, X_tmp,
     y_train, y_tmp,
     base_train, base_tmp,
     urg_train, urg_tmp) = train_test_split(
        X, y, baseline_col, urgency_col,
        test_size=0.40, random_state=42
    )
    (X_calib, X_test,
     y_calib, y_test,
     base_calib, base_test,
     urg_calib, urg_test) = train_test_split(
        X_tmp, y_tmp, base_tmp, urg_tmp,
        test_size=0.50, random_state=42
    )

    # ── Sample weights: emergency=3×, urgent=2×, routine=1× ──────────────
    # This tells the RF to pay more attention to the high-stakes transfers
    # during training without changing the feature set.
    weight_map = {"emergency": 3.0, "urgent": 2.0}
    sample_weights = np.array([weight_map.get(u, 1.0) for u in urg_train])

    # ── Baseline ─────────────────────────────────────────────────────────
    baseline_mae = mean_absolute_error(y_test, base_test)

    # ── Model ─────────────────────────────────────────────────────────────
    print("Training Random Forest (200 trees, emergency-weighted)...")
    rf = RandomForestRegressor(
        n_estimators=200,
        max_depth=15,
        min_samples_leaf=5,
        n_jobs=-1,
        random_state=42,
    )
    rf.fit(X_train, y_train, sample_weight=sample_weights)

    model_preds_test = rf.predict(X_test)
    model_mae        = mean_absolute_error(y_test, model_preds_test)
    improvement      = (baseline_mae - model_mae) / baseline_mae * 100

    # ── Conformal interval calibration ────────────────────────────────────
    # Problem (raised in GitHub issue #4): calibrating on the full population
    # gives 90% overall coverage but only ~73% on emergency/urgent transfers,
    # which are the high-variance routes that matter most clinically.
    #
    # Fix: calibrate on EMERGENCY+URGENT transfers only.
    # Their residuals are wider, so the resulting q05/q95 offsets are wider.
    # Routine transfers get over-covered (~95%+) — clinically harmless.
    # Emergency transfers get the target ~90% coverage.
    #
    # residual = actual − predicted  (positive = model under-predicted)
    # At inference: low  = point_pred + q05  (q05 is typically negative)
    #               high = point_pred + q95
    model_preds_calib = rf.predict(X_calib)
    residuals_all     = y_calib - model_preds_calib

    # Emergency/urgent subset of the calibration set
    em_mask = np.isin(urg_calib, ["emergency", "urgent"])
    if em_mask.sum() >= 50:   # enough samples to calibrate on
        residuals_calib = residuals_all[em_mask]
        calib_source    = f"emergency+urgent only (n={em_mask.sum()})"
    else:
        residuals_calib = residuals_all
        calib_source    = f"full calibration set (too few emergency rows: {em_mask.sum()})"

    q05 = float(np.percentile(residuals_calib, 5))
    q95 = float(np.percentile(residuals_calib, 95))

    # ── Verify coverage on the test set (overall + emergency breakdown) ───
    low_test  = model_preds_test + q05
    high_test = model_preds_test + q95
    low_test  = np.maximum(low_test, 1.0)

    coverage_all = float(np.mean((y_test >= low_test) & (y_test <= high_test)) * 100)

    em_test_mask  = np.isin(urg_test, ["emergency", "urgent"])
    if em_test_mask.sum() > 0:
        coverage_em = float(np.mean(
            (y_test[em_test_mask] >= low_test[em_test_mask]) &
            (y_test[em_test_mask] <= high_test[em_test_mask])
        ) * 100)
    else:
        coverage_em = float("nan")

    # ── Emergency-specific MAE on test set ───────────────────────────────
    if em_test_mask.sum() > 0:
        mae_em      = mean_absolute_error(y_test[em_test_mask], model_preds_test[em_test_mask])
        baseline_em = mean_absolute_error(y_test[em_test_mask], base_test[em_test_mask])
        improvement_em = (baseline_em - mae_em) / baseline_em * 100
    else:
        mae_em = baseline_em = improvement_em = float("nan")

    # ── ETA normalisation horizon ─────────────────────────────────────────
    p95_actual = float(np.percentile(y_train, 95))

    metrics = {
        "n_train":                   len(X_train),
        "n_calib":                   len(X_calib),
        "n_test":                    len(X_test),
        "baseline_mae":              round(baseline_mae, 2),
        "model_mae":                 round(model_mae, 2),
        "improvement_pct":           round(improvement, 1),
        "baseline_mae_emergency":    round(baseline_em, 2),
        "model_mae_emergency":       round(mae_em, 2),
        "improvement_pct_emergency": round(improvement_em, 1),
        "interval_coverage_pct":     round(coverage_all, 1),
        "interval_coverage_em_pct":  round(coverage_em, 1),
        "conformal_q05":             round(q05, 2),
        "conformal_q95":             round(q95, 2),
        "calib_source":              calib_source,
        "eta_norm_cap_minutes":      round(p95_actual, 1),
    }

    # ── Save model ────────────────────────────────────────────────────────
    payload = {
        "rf":      rf,
        "q05":     q05,
        "q95":     q95,
        "eta_cap": p95_actual,
        "metrics": metrics,
    }
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(payload, f)

    return metrics


# ── Entry point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    start = datetime.now()
    metrics = train()
    elapsed = (datetime.now() - start).seconds

    print()
    print("=" * 65)
    print("  RESULTS (copy these into README and slides)")
    print("=" * 65)
    print(f"  Training samples : {metrics['n_train']:,}  (emergency 3×, urgent 2× weighted)")
    print(f"  Calibration      : {metrics['n_calib']:,}  ({metrics['calib_source']})")
    print(f"  Test samples     : {metrics['n_test']:,}")
    print()
    print(f"  ── OVERALL ──────────────────────────────────────────────")
    print(f"  Baseline MAE     : {metrics['baseline_mae']:.1f} min  (routes table lookup)")
    print(f"  Model MAE        : {metrics['model_mae']:.1f} min  (Random Forest, weighted)")
    print(f"  Improvement      : {metrics['improvement_pct']:.1f}%")
    print(f"  Coverage         : {metrics['interval_coverage_pct']:.1f}%")
    print()
    print(f"  ── EMERGENCY + URGENT (lead with these in README) ───────")
    print(f"  Baseline MAE     : {metrics['baseline_mae_emergency']:.1f} min")
    print(f"  Model MAE        : {metrics['model_mae_emergency']:.1f} min")
    print(f"  Improvement      : {metrics['improvement_pct_emergency']:.1f}%")
    print(f"  Coverage         : {metrics['interval_coverage_em_pct']:.1f}%  (target ≥ 90%)")
    print()
    print(f"  Conformal offsets: q05={metrics['conformal_q05']:.1f} min,  q95={metrics['conformal_q95']:.1f} min")
    print(f"  ETA ranking cap  : {metrics['eta_norm_cap_minutes']:.0f} min")
    print(f"  Training time    : {elapsed}s")
    print(f"  Model saved to   : {MODEL_PATH}")
    print("=" * 65)

