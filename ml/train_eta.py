"""
Golden Hour — ETA Model Training
=================================
Trains a Random Forest on 34,135 historical blood transfers to predict
arrival time as a (low, mid, high) range in minutes.

Beats the baseline (routes.typical_travel_hours table lookup) by learning
patterns the fixed table cannot see: road degradation, transport mode,
time of day, and connectivity at the destination.

Run this once:
    python -m ml.train_eta

Output:
    ml/eta_model.pkl        — saved model (loaded by predict.py)
    prints baseline vs model MAE for the README
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
    Load and clean the transfers table joined with routes and facilities.

    Cleaning rules applied here (see KNOWLEDGE.md §8a for full reasoning):
    - Drop transfers with no received_at (~3%): cannot compute actual duration
    - Drop durations ≤5 min or >48 h: data entry errors / extreme outliers
    - Drop rows with no matching route: cannot compute road features
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
            (julianday(t.received_at) - julianday(t.dispatched_at))
                * 24 * 60 AS actual_minutes
        FROM transfers t
        JOIN routes r
            ON t.from_facility_id = r.from_facility_id
           AND t.to_facility_id   = r.to_facility_id
        JOIN facilities f
            ON t.to_facility_id = f.facility_id
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
    Returns a dict of evaluation metrics.
    """
    print("Loading training data...")
    df = load_training_data()
    print(f"  {len(df):,} clean records")

    X = df[FEATURE_COLS].values
    y = df["actual_minutes"].values

    X_train, X_test, y_train, y_test, df_train, df_test = train_test_split(
        X, y, df, test_size=0.2, random_state=42
    )

    # ── Baseline: use typical_travel_hours from the routes table ─────────
    baseline_preds = df_test["typical_travel_hours"].values * 60  # convert to minutes
    baseline_mae   = mean_absolute_error(y_test, baseline_preds)

    # ── Model ─────────────────────────────────────────────────────────────
    print("Training Random Forest (200 trees)...")
    rf = RandomForestRegressor(
        n_estimators=200,
        max_depth=15,
        min_samples_leaf=5,
        n_jobs=-1,
        random_state=42,
    )
    rf.fit(X_train, y_train)

    model_preds = rf.predict(X_test)
    model_mae   = mean_absolute_error(y_test, model_preds)
    improvement  = (baseline_mae - model_mae) / baseline_mae * 100

    # ── Interval coverage: how often does actual fall inside (low, high)? ─
    tree_preds   = np.array([t.predict(X_test) for t in rf.estimators_])  # (200, n_test)
    low_preds    = np.percentile(tree_preds, 5, axis=0)
    high_preds   = np.percentile(tree_preds, 95, axis=0)
    coverage     = np.mean((y_test >= low_preds) & (y_test <= high_preds)) * 100

    metrics = {
        "n_train":        len(X_train),
        "n_test":         len(X_test),
        "baseline_mae":   round(baseline_mae, 2),
        "model_mae":      round(model_mae, 2),
        "improvement_pct":round(improvement, 1),
        "interval_coverage_pct": round(coverage, 1),
    }

    # ── Save model ────────────────────────────────────────────────────────
    payload = {"rf": rf, "metrics": metrics}
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(payload, f)

    return metrics


# ── Entry point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    start = datetime.now()
    metrics = train()
    elapsed = (datetime.now() - start).seconds

    print()
    print("=" * 55)
    print("  RESULTS (copy these into README and slides)")
    print("=" * 55)
    print(f"  Training samples : {metrics['n_train']:,}")
    print(f"  Test samples     : {metrics['n_test']:,}")
    print()
    print(f"  Baseline MAE     : {metrics['baseline_mae']:.1f} min  (routes table lookup)")
    print(f"  Model MAE        : {metrics['model_mae']:.1f} min  (Random Forest)")
    print(f"  Improvement      : {metrics['improvement_pct']:.1f}%")
    print()
    print(f"  Interval coverage: {metrics['interval_coverage_pct']:.1f}%  (actual inside low–high range)")
    print(f"  Training time    : {elapsed}s")
    print(f"  Model saved to   : {MODEL_PATH}")
    print("=" * 55)
