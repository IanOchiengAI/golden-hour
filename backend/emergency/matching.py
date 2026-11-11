"""
Matching: rules engine → shortlist → ML ranking (or fallback) → ranked options.

Called once, when a request is created. The result is saved as RankedOption
rows so GET /requests/{id}/options only reads.

AI boundary: the rules engine decides which units are compatible and safe.
The model only orders sites that already passed every rule, and estimates ETA.
"""

import logging
from collections import Counter
from dataclasses import dataclass, field

from django.utils import timezone

from . import rules, stock
from .country import data_as_of, get_config

log = logging.getLogger(__name__)

MODEL, FALLBACK = "model", "fallback"


@dataclass
class MatchResult:
    compatible_groups: list
    warnings: list
    options: list = field(default_factory=list)   # dicts ready for RankedOption(**option)
    method: str = ""
    excluded: dict = field(default_factory=dict)  # exclusion reason → unit count
    sites_considered: int = 0


# ── ML layer (Ian's ml/ package) ─────────────────────────────────────────
def warm_model() -> None:
    """Load the ETA model in the background at server start (it takes several seconds)."""
    try:
        from ml.predict import get_eta_cap
        get_eta_cap()   # public call that loads and caches the model
    except Exception:
        log.exception("ETA model could not be loaded; requests will use the route-table fallback")


def _ml_rank(requesting_facility_id, candidates, component, dispatch_time):
    from ml.ranking import rank_candidates
    return rank_candidates(
        requesting_facility_id=requesting_facility_id,
        candidates=candidates,
        component=component,
        dispatch_time=dispatch_time,
        top_n=len(candidates),
        as_of=data_as_of(),   # dataset date from config, not the wall clock
    )


def _overall_method(ranked) -> str:
    """'model' only if every ranked site's ETA came from the model; otherwise 'fallback'."""
    methods = {r.get("eta_method") for r in ranked}
    return MODEL if methods == {MODEL} else FALLBACK


def _fallback_rank(candidates, routes):
    """Route-table ETA ±20% (same rule as ml.predict's fallback), fastest first."""
    out = []
    for cand in candidates:
        route = routes.get(cand["facility_id"])
        if not route:
            continue
        mid = route["typical_travel_hours"] * 60
        low, high = mid * 0.8, mid * 1.2
        warnings = []
        if (cand.get("grid_reliability") or 1.0) < 0.75:
            warnings.append(f"Grid reliability {cand['grid_reliability']:.0%} at source facility")
        out.append({
            **cand,
            "eta_low_min": round(low, 1), "eta_mid_min": round(mid, 1), "eta_high_min": round(high, 1),
            "reason": (
                f"ETA ~{mid:.0f} min ({low:.0f}–{high:.0f} min range, route table — AI offline) · "
                f"{route['road_km']:.0f} km {route['road_quality']} road · "
                f"{cand['units_available_at_facility']} unit(s) {cand['blood_group']} available · "
                f"expires {cand['expiry_date']}"
            ),
            "warnings": warnings,
        })
    out.sort(key=lambda r: r["eta_mid_min"])
    return out


# ── Main entry point ─────────────────────────────────────────────────────
def match(*, requesting_facility_id, patient_blood_group, component, units_requested,
          held_unit_ids=frozenset(), dispatch_time=None) -> MatchResult:
    cfg = get_config()
    dispatch_time = dispatch_time or timezone.localtime()

    # 1. Rules: compatible groups, then unit safety filter.
    groups, warnings = rules.compatible_donor_groups(patient_blood_group, component)
    result = MatchResult(compatible_groups=groups, warnings=list(warnings))

    safe, excluded = rules.filter_units(
        stock.candidate_units(component, groups),
        component=component, donor_groups=groups, as_of=data_as_of(), held_unit_ids=held_unit_ids,
    )
    result.excluded = excluded

    # 2. Rules: per-site pick and sufficiency.
    facilities = stock.facilities()
    allowed = {fid for fid, f in facilities.items() if f["facility_type"] in cfg["supplying_facility_types"]}
    offers = rules.build_site_offers(
        safe, units_requested=units_requested, patient_group=patient_blood_group, component=component,
        requesting_facility_id=requesting_facility_id, allowed_facility_ids=allowed,
    )
    result.sites_considered = len(offers)
    if not offers:
        return result   # no ETAs were needed, so method stays ""

    # 3. Shortlist the nearest sites by the route table; the model refines those.
    routes = stock.routes_to(requesting_facility_id)
    offers = [o for o in offers if o.facility_id in routes]
    offers.sort(key=lambda o: routes[o.facility_id]["typical_travel_hours"])
    offers = offers[: int(cfg.get("ranking_shortlist", 12))]

    national_stock = Counter(u["blood_group"] for u in safe)
    by_site = {o.facility_id: o for o in offers}
    candidates = []
    for o in offers:
        first = o.picked[0]   # the unit the site would send first represents it
        f = facilities[o.facility_id]
        candidates.append({
            "facility_id": o.facility_id,
            "facility_name": f["name"],
            "unit_id": first["unit_id"],
            "blood_group": first["blood_group"],
            "expiry_date": first["expiry_date"],
            "units_available_at_facility": o.units_available,
            "national_group_stock": national_stock[first["blood_group"]],
            "grid_reliability": f["grid_reliability"],
        })

    # 4. Rank with ml.ranking. Each ranked site reports eta_method ("model" or
    #    "fallback" when predict_eta used the route table). If ranking itself
    #    fails, the backend ranks by the route table so the workflow keeps going.
    try:
        ranked = _ml_rank(requesting_facility_id, candidates, component, dispatch_time)
    except Exception:
        log.exception("ML ranking failed; using route-table fallback")
        ranked = [{**r, "eta_method": FALLBACK} for r in _fallback_rank(candidates, routes)]
    result.method = _overall_method(ranked)

    # 5. Sites with enough units first, partial sites after (order within each kept).
    ranked.sort(key=lambda r: by_site[r["facility_id"]].is_partial(units_requested))

    for rank, r in enumerate(ranked[: int(cfg["options_count"])], start=1):
        offer = by_site[r["facility_id"]]
        partial = offer.is_partial(units_requested)
        option_warnings = list(r.get("warnings", []))
        if partial:
            option_warnings.append(
                f"Partial: {offer.units_available} of {units_requested} unit(s) available at this site"
            )
        result.options.append({
            "rank": rank,
            "facility_id": r["facility_id"],
            "facility_name": r["facility_name"],
            "eta_low_min": r["eta_low_min"],
            "eta_mid_min": r["eta_mid_min"],
            "eta_high_min": r["eta_high_min"],
            "method": r.get("eta_method") or FALLBACK,
            "reason": r["reason"],
            "warnings": option_warnings,
            "units_available": offer.units_available,
            "is_partial": partial,
            "unit_ids": [u["unit_id"] for u in offer.picked],
            "blood_groups": [u["blood_group"] for u in offer.picked],
        })
    return result
