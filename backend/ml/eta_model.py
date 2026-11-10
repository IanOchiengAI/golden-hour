"""
Golden Hour — ML ETA Model
Trains a RandomForestRegressor on historical transfers.
Predicts actual travel time (hours) + uncertainty bounds.
Falls back to routes.typical_travel_hours if offline.
"""
from __future__ import annotations

import os
import sys
import pickle
import sqlite3
from datetime import datetime
from typing import Tuple

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from data.database import get_connection

MODEL_PATH = os.path.join(os.path.dirname(__file__), "eta_model.pkl")

ROAD_QUALITY_MAP = {"good": 0, "fair": 1, "poor": 2}
TRANSPORT_MODE_MAP = {"vehicle": 0, "motorbike": 1, "psv": 2}
CONNECTIVITY_MAP = {"4G": 0, "3G": 1, "2G": 2}


class ETAModel:
    def __init__(self, rf=None, mae: float = None, baseline_mae: float = None):
        self.rf = rf
        self.mae = mae
        self.baseline_mae = baseline_mae
        self._fitted = rf is not None

    def predict(
        self,
        road_km: float,
        road_quality: str,
        transport_mode: str,
        dispatch_time: datetime,
        connectivity: str = "3G",
    ) -> Tuple[float, float]:
        """
        Returns (eta_hours, uncertainty_hours).
        uncertainty = std of individual tree predictions.
        """
        if not self._fitted:
            raise RuntimeError("Model not trained. Call train() first.")

        X = np.array([[
            road_km,
            ROAD_QUALITY_MAP.get(road_quality, 1),
            TRANSPORT_MODE_MAP.get(transport_mode, 0),
            dispatch_time.hour,
            dispatch_time.weekday(),
            CONNECTIVITY_MAP.get(connectivity, 1),
        ]])

        # Get predictions from all trees for uncertainty
        tree_preds = np.array([
            tree.predict(X)[0] for tree in self.rf.estimators_
        ])
        eta = float(np.mean(tree_preds))
        uncertainty = float(np.std(tree_preds))

        return max(0.1, eta), max(0.05, uncertainty)

    def save(self):
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(self, f)
        print(f"Model saved to {MODEL_PATH}")

    @classmethod
    def load(cls) -> "ETAModel":
        with open(MODEL_PATH, "rb") as f:
            return pickle.load(f)

    @classmethod
    def load_or_train(cls) -> "ETAModel":
        if os.path.exists(MODEL_PATH):
            print("Loading cached ETA model...")
            return cls.load()
        print("No cached model — training now...")
        return train()


def _build_training_data(conn: sqlite3.Connection) -> pd.DataFrame:
    """
    Join transfers → routes → facilities to build feature matrix.
    """
    df = pd.read_sql(
        """
        SELECT
            t.transfer_id,
            t.from_facility_id,
            t.to_facility_id,
            t.transport_mode,
            t.dispatched_at,
            t.received_at,
            r.road_km,
            r.road_quality,
            r.typical_travel_hours,
            f_to.connectivity
        FROM transfers t
        JOIN routes r
            ON t.from_facility_id = r.from_facility_id
           AND t.to_facility_id   = r.to_facility_id
        JOIN facilities f_to
            ON t.to_facility_id = f_to.facility_id
        WHERE t.received_at IS NOT NULL
          AND t.dispatched_at IS NOT NULL
        """,
        conn,
    )

    # Compute actual hours
    df["dispatched_dt"] = pd.to_datetime(df["dispatched_at"])
    df["received_dt"] = pd.to_datetime(df["received_at"])
    df["actual_hours"] = (
        df["received_dt"] - df["dispatched_dt"]
    ).dt.total_seconds() / 3600.0

    # Filter out outliers (< 0 or > 72h)
    df = df[(df["actual_hours"] > 0) & (df["actual_hours"] < 72)]

    # Encode features
    df["road_quality_enc"] = df["road_quality"].map(ROAD_QUALITY_MAP).fillna(1)
    df["transport_mode_enc"] = df["transport_mode"].map(TRANSPORT_MODE_MAP).fillna(0)
    df["connectivity_enc"] = df["connectivity"].map(CONNECTIVITY_MAP).fillna(1)
    df["hour_of_day"] = df["dispatched_dt"].dt.hour
    df["day_of_week"] = df["dispatched_dt"].dt.dayofweek

    return df


def train() -> ETAModel:
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import mean_absolute_error

    conn = get_connection()
    df = _build_training_data(conn)
    conn.close()

    print(f"Training on {len(df):,} transfer records...")

    feature_cols = [
        "road_km",
        "road_quality_enc",
        "transport_mode_enc",
        "hour_of_day",
        "day_of_week",
        "connectivity_enc",
    ]
    X = df[feature_cols].values
    y = df["actual_hours"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    rf = RandomForestRegressor(
        n_estimators=200,
        max_depth=12,
        min_samples_leaf=5,
        n_jobs=-1,
        random_state=42,
    )
    rf.fit(X_train, y_train)

    # Evaluate
    y_pred = rf.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)

    baseline_mae = mean_absolute_error(
        y_test,
        df.loc[X_test[:, 0] == X_test[:, 0], "typical_travel_hours"].values[:len(y_test)]
        if "typical_travel_hours" in df.columns
        else [df["typical_travel_hours"].mean()] * len(y_test),
    )

    # Simpler baseline MAE
    baseline_preds = df.iloc[: len(y_test)]["typical_travel_hours"].values
    if len(baseline_preds) == len(y_test):
        baseline_mae = mean_absolute_error(y_test, baseline_preds)
    else:
        baseline_mae = mean_absolute_error(y_test, [df["typical_travel_hours"].mean()] * len(y_test))

    improvement = (baseline_mae - mae) / baseline_mae * 100

    print(f"✅ ML Model MAE:      {mae:.3f} hours")
    print(f"   Baseline MAE:     {baseline_mae:.3f} hours")
    print(f"   Improvement:      {improvement:.1f}%")
    print(f"   Training samples: {len(X_train):,}")
    print(f"   Test samples:     {len(X_test):,}")

    model = ETAModel(rf=rf, mae=mae, baseline_mae=baseline_mae)
    model.save()
    return model


if __name__ == "__main__":
    m = train()
    print("Model ready.")
