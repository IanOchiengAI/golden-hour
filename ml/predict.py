"""
Golden Hour — ETA Prediction Interface
=======================================
Roland calls predict_eta() from the API.
Ian owns this file.

Usage:
    from ml.predict import predict_eta

    low, mid, high, method = predict_eta("RBTC-NBO", "HSP-012", datetime.now())
    # → (35.2, 48.7, 71.4, "model")   — ML model used
    # → (38.4, 48.0, 57.6, "fallback") — table lookup used
    # → "ETA 49 min (35–71 min range)"

Returns a 4-tuple: (low, mid, high, method)
  method = "model"    — ML prediction used
  method = "fallback" — routes.typical_travel_hours ±20% used (model offline or error)

If the model file is missing or the route is unknown, falls back to the
routes.typical_travel_hours table lookup (with ±20% uncertainty).
"""

import os
import pickle
import sqlite3
from datetime import datetime
from typing import Tuple

import numpy as np

# ── Paths ─────────────────────────────────────────────────────────────────
_HERE     = os.path.dirname(os.path.abspath(__file__))
_ROOT     = os.path.dirname(_HERE)
DB_PATH   = os.path.join(
    _ROOT,
    "Terumo BCT Hackathon - Applicant_s Kit",
    "Starter Dataset",
    "blood_system.sqlite",
)
MODEL_PATH = os.path.join(_HERE, "eta_model.pkl")

# ── Encodings (must match train_eta.py exactly) ───────────────────────────
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

# ── Lazy model cache (loaded once, reused) ────────────────────────────────
_model_cache = None


def _load_model() -> dict:
    """Load the full model payload from disk (cached after first call)."""
    global _model_cache
    if _model_cache is None:
        with open(MODEL_PATH, "rb") as f:
            _model_cache = pickle.load(f)
    return _model_cache


def _get_route(source_id: str, dest_id: str) -> dict | None:
    """Look up road distance, quality, and destination connectivity."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        """
        SELECT r.road_km, r.road_quality, r.typical_travel_hours, f.connectivity
        FROM routes r
        JOIN facilities f ON r.to_facility_id = f.facility_id
        WHERE r.from_facility_id = ? AND r.to_facility_id = ?
        """,
        (source_id, dest_id),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def _fallback(typical_travel_hours: float) -> Tuple[float, float, float, str]:
    """
    Fallback when model is offline or route unknown.
    Returns table value ±20% as the uncertainty range, plus method="fallback".
    """
    mid  = typical_travel_hours * 60
    low  = mid * 0.80
    high = mid * 1.20
    return round(low, 1), round(mid, 1), round(high, 1), "fallback"


def predict_eta(
    source_id: str,
    dest_id: str,
    dispatch_time: datetime,
    transport_mode: str = "vehicle",
) -> Tuple[float, float, float, str]:
    """
    Predict blood transfer ETA as a (low, mid, high, method) tuple.

    Args:
        source_id      : facility_id of the supplying facility (e.g. "RBTC-NBO")
        dest_id        : facility_id of the requesting hospital (e.g. "HSP-012")
        dispatch_time  : when the blood will leave (usually datetime.now())
        transport_mode : "vehicle" | "motorbike" | "public_service_vehicle"

    Returns:
        (low, mid, high, method) where:
          - low/mid/high are in minutes (e.g. 35.2, 48.7, 71.4)
          - method is "model" if the ML model was used, "fallback" if the
            routes table was used (Roland uses this to set ai_offline flag)
        Returns (None, None, None, None) if no road route exists.

    Falls back to routes.typical_travel_hours ±20% if:
        - Model file not found (not yet trained)
        - No route exists between the two facilities
        - Any unexpected error
    """
    # ── 1. Get route info ─────────────────────────────────────────────────
    route = _get_route(source_id, dest_id)

    if route is None:
        # No road route found — cannot dispatch via road
        return (None, None, None, None)

    # ── 2. Try the ML model ───────────────────────────────────────────────
    try:
        payload = _load_model()
        rf      = payload["rf"]
        q05     = payload["q05"]   # conformal lower offset (usually negative)
        q95     = payload["q95"]   # conformal upper offset (usually positive)

        X = np.array([[
            route["road_km"],
            ROAD_QUALITY_ENC.get(route["road_quality"], 1),
            TRANSPORT_MODE_ENC.get(transport_mode, 0),
            dispatch_time.hour,
            dispatch_time.weekday(),
            CONNECTIVITY_ENC.get(route["connectivity"], 1),
        ]])

        # Point prediction (median)
        mid = float(rf.predict(X)[0])

        # Conformal prediction interval — calibrated on a held-out set so that
        # ~90% of real outcomes fall inside [low, high].
        # low  = mid + q05  (q05 is a negative offset: model tends to over-predict by this)
        # high = mid + q95
        low  = mid + q05
        high = mid + q95

        # Safety floor: low ≥ 1 min, high > low
        low  = max(low, 1.0)
        high = max(high, low + 1.0)

        return round(low, 1), round(mid, 1), round(high, 1), "model"

    except Exception:
        # Model offline or error — fall back to table lookup
        return _fallback(route["typical_travel_hours"])


def get_eta_cap() -> float:
    """
    Return the ETA normalisation cap in minutes (95th percentile of training actuals).
    Used by ranking.py so the cost function reflects the realistic worst-case,
    not an arbitrary 12-hour ceiling.
    Falls back to 240 min (4 h) if the model is not loaded.
    """
    try:
        payload = _load_model()
        return payload.get("eta_cap", 240.0)
    except Exception:
        return 240.0


def explain_eta(
    source_id: str,
    dest_id: str,
    low: float,
    mid: float,
    high: float,
    units_available: int,
    blood_group: str,
    expiry_date: str,
) -> str:
    """
    Generate a plain-language explanation for the officer screen.

    Example output:
        "ETA ~49 min (35–71 min range) · 11 km road · 3 units O− available · expires 2026-11-14"
    """
    route = _get_route(source_id, dest_id)
    if not route:
        return f"{units_available} unit(s) {blood_group} available · route unknown"

    return (
        f"ETA ~{mid:.0f} min ({low:.0f}–{high:.0f} min range) · "
        f"{route['road_km']:.0f} km {route['road_quality']} road · "
        f"{units_available} unit(s) {blood_group} available · "
        f"expires {expiry_date}"
    )


# ── Quick test ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    test_cases = [
        ("RBTC-NBO", "HSP-012", "Nairobi → Kisumu"),
        ("RBTC-NBO", "HSP-002", "Nairobi → Eastlands"),
        ("RBTC-ELD", "HSP-021", "Eldoret → Lodwar (poor road, 2G)"),
        ("RBTC-MSA", "HSP-008", "Mombasa → Coast Teaching"),
    ]

    print("predict_eta() test — model must be trained first (run train_eta.py)")
    print()
    for source, dest, label in test_cases:
        low, mid, high, method = predict_eta(source, dest, datetime.now())
        if mid:
            print(f"  {label}  [{method}]")
            print(f"    → {low:.0f}–{mid:.0f}–{high:.0f} min")
            print(f"    → {explain_eta(source, dest, low, mid, high, 3, 'O-', '2026-11-14')}")
        else:
            print(f"  {label} → no route found")
        print()
