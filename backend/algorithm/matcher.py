"""
Golden Hour — Dispatch Matching Engine
Implements: ABO filter → cold chain filter → cost scoring → top-3 options
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import List, Optional
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from algorithm.abo import (
    compatible_donor_groups,
    MAX_SHELF_LIFE,
    RARE_GROUPS,
    ALL_GROUPS,
)
from data.database import get_connection

# Cost weights (from KNOWLEDGE.md)
W_TIME = 0.5
W_SCARCITY = 0.3
W_EXPIRY = 0.2


@dataclass
class DispatchCandidate:
    facility_id: str
    facility_name: str
    facility_county: str
    unit_id: str
    blood_group: str
    component: str
    expiry_date: str
    temp_excursion_exposed: bool
    road_km: float
    road_quality: str
    eta_hours: float
    eta_uncertainty: float  # ± hours from ML model
    eta_source: str         # 'ml_model' or 'table_fallback'
    cost_score: float
    units_available: int
    grid_reliability: float
    has_backup_power: bool
    lat: float
    lon: float
    explanation: str = ""
    warnings: List[str] = field(default_factory=list)


@dataclass
class DispatchRequest:
    requesting_facility_id: str
    component: str
    patient_blood_group: str    # may be 'unknown'
    units_needed: int
    urgency: str                # 'emergency' | 'urgent' | 'routine'
    dispatch_time: Optional[datetime] = None


def _load_stock_snapshot(conn: sqlite3.Connection, component: str) -> dict:
    """Load latest stock counts per blood group across all facilities."""
    rows = conn.execute(
        """
        SELECT blood_group, SUM(units_in_stock_end_of_day) as total
        FROM daily_stock
        WHERE date = (SELECT MAX(date) FROM daily_stock)
          AND component = ?
        GROUP BY blood_group
        """,
        (component,),
    ).fetchall()
    return {r["blood_group"]: r["total"] or 0 for r in rows}


def _unit_cost(
    expiry_date_str: str,
    blood_group: str,
    component: str,
    eta_hours: float,
    stock_snapshot: dict,
    today: date,
) -> float:
    """
    Compute cost score for a (unit, request) pair.
    Lower = better dispatch option.
    """
    # ETA component (normalised to 0-1 assuming max 48h)
    eta_norm = min(eta_hours / 48.0, 1.0)

    # Scarcity component
    total = stock_snapshot.get(blood_group, 0)
    scarcity = 1.0 / (total + 1.0)
    scarcity = min(scarcity, 1.0)

    # Expiry / FEFO component
    try:
        expiry = date.fromisoformat(expiry_date_str)
        days_left = (expiry - today).days
        max_life = MAX_SHELF_LIFE.get(component, 42)
        expiry_score = 1.0 - max(0.0, min(days_left / max_life, 1.0))
    except Exception:
        expiry_score = 0.5  # neutral if date unknown

    return W_TIME * eta_norm + W_SCARCITY * scarcity + W_EXPIRY * expiry_score


def find_dispatch_options(
    request: DispatchRequest,
    eta_model=None,          # optional ML model (None → table fallback)
    top_n: int = 3,
) -> dict:
    """
    Main dispatch function.

    Returns:
        {
          "candidates": [DispatchCandidate, ...],   # top N, ranked by cost
          "unknown_group_warning": bool,
          "request_id_ref": str | None,
        }
    """
    conn = get_connection()
    today = date.today()

    # ── 0. Unknown blood group handling ──────────────────────────────────────
    unknown_group = request.patient_blood_group in (None, "unknown", "")
    if unknown_group:
        patient_group = "unknown"
        # Still search, but flag prominently
    else:
        patient_group = request.patient_blood_group

    allowed_donor_groups = compatible_donor_groups(patient_group, request.component)

    # ── 1. Load global stock snapshot for scarcity scoring ───────────────────
    stock_snapshot = _load_stock_snapshot(conn, request.component)

    # ── 2. Find in-stock, unexpired, cold-chain-safe units at all facilities ─
    placeholders = ",".join("?" * len(allowed_donor_groups))
    units_rows = conn.execute(
        f"""
        SELECT
            u.unit_id,
            u.blood_group,
            u.component,
            u.expiry_date,
            u.current_facility_id,
            u.temp_excursion_exposed,
            f.name AS facility_name,
            f.county AS facility_county,
            f.lat,
            f.lon,
            f.grid_reliability,
            f.has_blood_fridge_backup_power
        FROM units u
        JOIN facilities f ON u.current_facility_id = f.facility_id
        WHERE u.status = 'in_stock'
          AND u.component = ?
          AND u.blood_group IN ({placeholders})
          AND u.expiry_date > ?
          AND u.current_facility_id != ?
        ORDER BY u.expiry_date ASC
        """,
        (request.component, *allowed_donor_groups, str(today),
         request.requesting_facility_id),
    ).fetchall()

    # ── 3. Get route info for each candidate source facility ─────────────────
    # Collect unique source facilities
    facility_ids = list({r["current_facility_id"] for r in units_rows})
    if not facility_ids:
        conn.close()
        return {
            "candidates": [],
            "unknown_group_warning": unknown_group,
            "request_id_ref": None,
            "error": "No compatible in-stock units found across all 47 facilities.",
        }

    route_map = {}
    for fid in facility_ids:
        row = conn.execute(
            """
            SELECT road_km, typical_travel_hours, road_quality
            FROM routes
            WHERE from_facility_id = ?
              AND to_facility_id = ?
            """,
            (fid, request.requesting_facility_id),
        ).fetchone()
        if row:
            route_map[fid] = dict(row)

    # Also get per-facility unit count
    units_per_facility: dict[str, int] = {}
    for r in units_rows:
        fid = r["current_facility_id"]
        units_per_facility[fid] = units_per_facility.get(fid, 0) + 1

    # ── 4. Score every eligible unit ─────────────────────────────────────────
    dispatch_time = request.dispatch_time or datetime.now()
    scored: List[tuple[float, DispatchCandidate]] = []

    seen_facilities: set[str] = set()

    for unit in units_rows:
        fid = unit["current_facility_id"]
        route = route_map.get(fid)
        if not route:
            continue  # no road route found — skip

        # ETA prediction
        if eta_model is not None:
            try:
                eta_hours, eta_uncertainty = eta_model.predict(
                    road_km=route["road_km"],
                    road_quality=route["road_quality"],
                    transport_mode="vehicle",
                    dispatch_time=dispatch_time,
                    connectivity=unit.get("connectivity", "3G"),
                )
                eta_source = "ml_model"
            except Exception:
                eta_hours = route["typical_travel_hours"]
                eta_uncertainty = eta_hours * 0.2
                eta_source = "table_fallback"
        else:
            eta_hours = route["typical_travel_hours"]
            eta_uncertainty = eta_hours * 0.2
            eta_source = "table_fallback"

        # Hard constraint: skip temp excursion unless officer override
        warnings = []
        if unit["temp_excursion_exposed"]:
            warnings.append(
                "⚠️ Cold chain excursion recorded — requires officer override to dispatch."
            )
            # Still include in list but cost = infinity → will appear last
            cost = float("inf")
        else:
            cost = _unit_cost(
                unit["expiry_date"],
                unit["blood_group"],
                unit["component"],
                eta_hours,
                stock_snapshot,
                today,
            )

        if unit["blood_group"] in RARE_GROUPS and not unknown_group:
            warnings.append(
                f"ℹ️ {unit['blood_group']} is rare — scarcity considered in ranking."
            )

        if not unit["has_blood_fridge_backup_power"]:
            warnings.append("⚡ Source facility has no backup power for fridges.")

        grid_rel = unit["grid_reliability"] or 1.0
        if grid_rel < 0.7:
            warnings.append(
                f"⚡ Grid reliability at source: {grid_rel:.0%} — risk of cold chain interruption."
            )

        # Build explanation
        explanation = (
            f"ETA ~{eta_hours:.1f}h ± {eta_uncertainty:.1f}h via {route['road_quality']} road "
            f"({route['road_km']:.0f} km). "
            f"Expires {unit['expiry_date']}. "
            f"Group {unit['blood_group']} ({'rare' if unit['blood_group'] in RARE_GROUPS else 'common'}). "
            f"{units_per_facility.get(fid, 1)} unit(s) available at this facility."
        )

        candidate = DispatchCandidate(
            facility_id=fid,
            facility_name=unit["facility_name"],
            facility_county=unit["facility_county"],
            unit_id=unit["unit_id"],
            blood_group=unit["blood_group"],
            component=unit["component"],
            expiry_date=unit["expiry_date"],
            temp_excursion_exposed=bool(unit["temp_excursion_exposed"]),
            road_km=route["road_km"],
            road_quality=route["road_quality"],
            eta_hours=eta_hours,
            eta_uncertainty=eta_uncertainty,
            eta_source=eta_source,
            cost_score=cost,
            units_available=units_per_facility.get(fid, 1),
            grid_reliability=grid_rel,
            has_backup_power=bool(unit["has_blood_fridge_backup_power"]),
            lat=unit["lat"],
            lon=unit["lon"],
            explanation=explanation,
            warnings=warnings,
        )

        # Only keep 1 candidate per facility (best unit = lowest expiry = first in sorted order)
        if fid not in seen_facilities:
            seen_facilities.add(fid)
            scored.append((cost, candidate))

    conn.close()

    # ── 5. Sort by cost, return top N ─────────────────────────────────────────
    scored.sort(key=lambda x: x[0])
    top_candidates = [c for _, c in scored[:top_n]]

    return {
        "candidates": top_candidates,
        "unknown_group_warning": unknown_group,
        "request_id_ref": None,
    }
