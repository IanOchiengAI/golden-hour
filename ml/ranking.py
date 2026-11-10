"""
Golden Hour — Multi-Criteria Dispatch Ranking Engine
=====================================================
Scores and ranks eligible candidate facilities/units for an emergency blood request.

Why this cost function?
-----------------------
Cost = (0.5 * ETA_score) + (0.3 * Scarcity_score) + (0.2 * Expiry_score)

1. ETA (Weight = 0.5 / 50%):
   In acute clinical emergencies (obstetric haemorrhage, road trauma), minutes dictate
   survival. Arrival time is the primary determinant.
   Normalized: eta_minutes / eta_cap  where eta_cap = 95th pct of historical actuals (~602 min).

2. Scarcity (Weight = 0.3 / 30%):
   Rh-negative blood (especially O-) faces a 47.4% unmet rate nationwide, with only
   7 units of O- RBC in stock across all 47 facilities. If Facility A is 30 mins away
   with 1 unit of O- left, and Facility B is 35 mins away with 8 units of O+, sending O-
   to an O+ patient would deplete the universal reserve. Scarcity penalty prevents this.
   Score = 1.0 / (units_of_this_group_in_stock + 1)

3. Expiry / FEFO (Weight = 0.2 / 20%):
   23% of all RBC/WB blood units in Kenya are wasted due to expiry on shelves.
   FEFO (First Expired, First Out) prioritizes eligible units that expire sooner
   (provided they are unexpired and cold-chain safe), directly reducing wastage.
   Score = 1.0 - (days_until_expiry / max_shelf_life)

Usage for Roland (Django API):
------------------------------
    from ml.ranking import rank_candidates

    ranked_options = rank_candidates(
        requesting_facility_id="HSP-012",
        patient_blood_group="O+",
        component="RBC",
        candidates=eligible_units_from_db,
        dispatch_time=datetime.now()
    )
"""

from datetime import datetime, date
from typing import List, Dict, Any, Optional
from ml.predict import predict_eta, explain_eta, get_eta_cap, _get_route

# Dataset as-of date — use this instead of date.today() for expiry calculations.
# The starter dataset runs to 2026-10-31. Using today() makes units look ~10 days
# closer to expiry than they really are (critical for PLT with a 5-day shelf life).
DATA_AS_OF = date(2026, 10, 31)

# ETA normalisation cap — loaded from the trained model at import time.
# This is the 95th percentile of actual transfer times in the training data,
# so differences within the realistic range (e.g. 30 vs 90 min) meaningfully
# move the cost score. Falls back to 240 min if model is not loaded yet.
_ETA_CAP_MINUTES: float = get_eta_cap()

# Shelf life in days for FEFO calculation
MAX_SHELF_LIFE = {
    "RBC": 42,
    "WB": 35,
    "PLT": 5,
    "FFP": 365,
    "CRYO": 365,
}

# Rare groups subject to enhanced scarcity protection
RARE_BLOOD_GROUPS = {"O-", "A-", "B-", "AB-"}


def compute_dispatch_score(
    eta_mid_minutes: float,
    group_stock_count: int,
    expiry_date_str: str,
    component: str,
    as_of: Optional[date] = None,
    eta_cap: Optional[float] = None,
) -> float:
    """
    Computes scalar penalty cost for a candidate. Lower score = better recommendation.

    Args:
        as_of:   Reference date for expiry calculation. Defaults to DATA_AS_OF
                 (2026-10-31, the dataset snapshot date). Roland passes
                 config["data_as_of"] so this never drifts with the wall clock.
        eta_cap: ETA normalisation ceiling in minutes. Defaults to the value
                 learned from the training data (95th percentile of actuals).
                 Using a realistic cap (e.g. 180 min) instead of 720 min means
                 a 30 vs 60 min difference actually moves the cost score.
    """
    reference_date  = as_of or DATA_AS_OF
    cap             = eta_cap if eta_cap is not None else _ETA_CAP_MINUTES

    # 1. Normalized ETA (0 to 1, capped at the realistic worst-case horizon)
    eta_norm = min(max(eta_mid_minutes, 0.0) / cap, 1.0)

    # 2. Scarcity score (higher penalty when stock of this group is critically low)
    scarcity_score = 1.0 / (float(group_stock_count) + 1.0)

    # 3. Expiry score (higher urgency/favourability for units expiring sooner)
    # Note: FEFO wants sooner expiry to be preferred, so lower penalty for sooner expiry.
    try:
        exp_date = date.fromisoformat(expiry_date_str)
        days_left = max((exp_date - reference_date).days, 0)
        max_life = MAX_SHELF_LIFE.get(component, 42)
        # 0 = expires today (use immediately!), 1 = brand new unit
        expiry_penalty = min(days_left / float(max_life), 1.0)
    except Exception:
        expiry_penalty = 0.5

    # Weighted composite score
    total_cost = (0.50 * eta_norm) + (0.30 * scarcity_score) + (0.20 * expiry_penalty)
    return round(total_cost, 4)


def rank_candidates(
    requesting_facility_id: str,
    candidates: List[Dict[str, Any]],
    component: str = "RBC",
    dispatch_time: datetime = None,
    top_n: int = 3,
    as_of: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """
    Takes a list of pre-filtered candidate facilities/units from Roland's DB query
    and applies ETA prediction + multi-factor ranking.

    Each candidate dict in `candidates` should have:
        - facility_id: str
        - facility_name: str
        - unit_id: str
        - blood_group: str
        - expiry_date: str (YYYY-MM-DD)
        - units_available_at_facility: int
        - national_group_stock: int (optional, defaults to units_available)
        - grid_reliability: float (optional)

    Args:
        as_of: Reference date for expiry calculations. Roland passes
               config["data_as_of"] (2026-10-31). Defaults to DATA_AS_OF
               so the model never drifts with the wall clock during the hackathon.

    Returns top_n ranked candidate dicts, each including:
        eta_low_min, eta_mid_min, eta_high_min, cost_score,
        reason (plain language), warnings, eta_method ("model"|"fallback").
    """
    if dispatch_time is None:
        dispatch_time = datetime.now()

    scored = []
    seen_facilities = set()

    for cand in candidates:
        source_id = cand["facility_id"]
        # Skip same facility (handled locally if requested)
        if source_id == requesting_facility_id:
            continue

        # Keep top unit per facility to provide geographic diversity in top 3
        if source_id in seen_facilities:
            continue

        # 1. Predict ETA range via ML model (with table fallback)
        #    predict_eta now returns a 4-tuple — the 4th value tells Roland
        #    whether the ML model fired ("model") or the route table was used ("fallback").
        #    We also fetch the route once here and pass it into explain_eta to avoid
        #    a second SQLite connection for the exact same query.
        low, mid, high, eta_method = predict_eta(
            source_id=source_id,
            dest_id=requesting_facility_id,
            dispatch_time=dispatch_time,
        )

        if mid is None:
            continue  # No road connection found

        # Route already fetched inside predict_eta; re-fetch once here for explain_eta.
        # This is one connection per facility (not two) because predict_eta's internal
        # _get_route result is not exposed. Total: 1 connection per facility evaluated.
        route = _get_route(source_id, requesting_facility_id)

        # 2. Compute cost score (use dataset as-of date, not today)
        nat_stock = cand.get("national_group_stock", cand.get("units_available_at_facility", 5))
        if "national_group_stock" not in cand:
            import logging
            logging.getLogger(__name__).warning(
                "national_group_stock missing for %s — scarcity score will be per-facility only",
                source_id,
            )
        cost = compute_dispatch_score(
            eta_mid_minutes=mid,
            group_stock_count=nat_stock,
            expiry_date_str=cand["expiry_date"],
            component=component,
            as_of=as_of,
            eta_cap=_ETA_CAP_MINUTES,
        )

        # 3. Generate plain language reason — pass pre-fetched route to avoid a
        #    third SQLite connection for the same source/dest pair.
        explanation = explain_eta(
            source_id=source_id,
            dest_id=requesting_facility_id,
            low=low,
            mid=mid,
            high=high,
            units_available=cand.get("units_available_at_facility", 1),
            blood_group=cand["blood_group"],
            expiry_date=cand["expiry_date"],
            route=route,
        )

        # Add warnings if low grid reliability or scarce group
        warnings = []
        if cand.get("grid_reliability", 1.0) < 0.75:
            warnings.append(f"Grid reliability {cand['grid_reliability']:.0%} at source facility")
        if cand["blood_group"] in RARE_BLOOD_GROUPS:
            warnings.append(f"Rare blood group ({cand['blood_group']}) — scarcity rules applied")

        result = dict(cand)
        result.update({
            "eta_low_min": low,
            "eta_mid_min": mid,
            "eta_high_min": high,
            "cost_score": cost,
            "reason": explanation,
            "warnings": warnings,
            "eta_method": eta_method,  # "model" or "fallback" — Roland uses this for ai_offline flag
        })

        seen_facilities.add(source_id)
        scored.append((cost, result))

    # Sort ascending by cost (lowest cost = best option)
    scored.sort(key=lambda x: x[0])
    return [item[1] for item in scored[:top_n]]


# ── Quick Demo for Team Walkthrough ─────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 65)
    print("  GOLDEN HOUR — DISPATCH RANKING ENGINE DEMO")
    print("  Request: HSP-002 (Eastlands) urgently needs O+ RBC")
    print("=" * 65)

    test_candidates = [
        {
            "facility_id": "RBTC-NBO",
            "facility_name": "Nairobi Regional Blood Centre",
            "unit_id": "U2610-NBO-0012",
            "blood_group": "O+",
            "expiry_date": "2026-11-15",
            "units_available_at_facility": 5,
            "grid_reliability": 0.97,
        },
        {
            "facility_id": "SAT-MKS",
            "facility_name": "Machakos Satellite Centre",
            "unit_id": "U2610-MKS-0044",
            "blood_group": "O+",
            "expiry_date": "2026-11-12",
            "units_available_at_facility": 2,
            "grid_reliability": 0.87,
        },
        {
            "facility_id": "SAT-LDW",
            "facility_name": "Lodwar Satellite Centre",
            "unit_id": "U2610-LDW-0003",
            "blood_group": "O-",
            "expiry_date": "2026-11-20",
            "units_available_at_facility": 1,
            "grid_reliability": 0.62,
        },
    ]

    results = rank_candidates(
        requesting_facility_id="HSP-002",
        candidates=test_candidates,
        component="RBC",
        dispatch_time=datetime.now(),
    )

    for i, r in enumerate(results, 1):
        print(f"\n[ Rank {i} ] {r['facility_name']} (Cost: {r['cost_score']:.3f})")
        print(f"  ETA Range : {r['eta_low_min']:.0f} to {r['eta_high_min']:.0f} mins (Likely: ~{r['eta_mid_min']:.0f} min)")
        print(f"  Reason    : {r['reason']}")
        if r["warnings"]:
            print(f"  Alerts    : {' | '.join(r['warnings'])}")
    print("\n" + "=" * 65)

