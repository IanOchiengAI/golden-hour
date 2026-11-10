"""
Golden Hour rules engine — fixed code, never AI.

Answers three questions, in order:
  1. Which donor blood groups can this patient safely receive?   compatible_donor_groups()
  2. Which units are safe to send right now?                     check_unit() / filter_units()
  3. Which units would each site send, and does it have enough?  pick_units() / build_site_offers()

Nothing here reads a database or the clock: callers pass in the units and the
data as-of date, so every rule can be unit-tested and shown to a judge as-is.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date

BLOOD_GROUPS = ("O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+")
UNKNOWN = "unknown"

# ── 1. Compatibility tables ──────────────────────────────────────────────
# Red cells: patient group → donor groups whose red cells the patient can receive.
# (Inverse of the "donor can give to" table in .agents/KNOWLEDGE.md §1.)
RED_CELL_DONORS = {
    "O-":  ["O-"],
    "O+":  ["O-", "O+"],
    "A-":  ["O-", "A-"],
    "A+":  ["O-", "O+", "A-", "A+"],
    "B-":  ["O-", "B-"],
    "B+":  ["O-", "O+", "B-", "B+"],
    "AB-": ["O-", "A-", "B-", "AB-"],
    "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
}

# Plasma (FFP) is the reverse: the donor's plasma antibodies must not attack the
# patient's red cells. AB plasma has no anti-A/anti-B, so it suits everyone.
# RhD does not matter for plasma.
PLASMA_DONORS = {
    "O-":  ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
    "O+":  ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
    "A-":  ["A-", "A+", "AB-", "AB+"],
    "A+":  ["A-", "A+", "AB-", "AB+"],
    "B-":  ["B-", "B+", "AB-", "AB+"],
    "B+":  ["B-", "B+", "AB-", "AB+"],
    "AB-": ["AB-", "AB+"],
    "AB+": ["AB-", "AB+"],
}

# Unknown patient group: give the universal donor for that component and warn.
UNKNOWN_GROUP_DEFAULT = {
    "RBC": ["O-"],
    "FFP": ["AB-", "AB+"],
}
UNKNOWN_GROUP_WARNING = {
    "RBC": "Patient blood group unknown — recommending O− universal donor red cells. "
           "Confirm before dispatch; O− stock is critically low.",
    "FFP": "Patient blood group unknown — recommending group AB universal donor plasma. "
           "Confirm before dispatch.",
}

# The universal donor groups are the scarcest reserve; a site sends them last
# unless the patient actually needs them.
UNIVERSAL_DONOR = {"RBC": {"O-"}, "PLT": {"O-"}, "FFP": {"AB-", "AB+"}}


class CompatibilityError(ValueError):
    """The request cannot be matched by rule (e.g. platelets for an unknown group)."""


def _plt_donors(patient_group: str) -> list[str]:
    # Platelets: plasma-compatible ABO (platelets are suspended in donor plasma),
    # and RhD-negative patients get RhD-negative platelets (platelet bags carry
    # some red cells). Strict on purpose: the officer can override, the code cannot.
    abo_ok = set(PLASMA_DONORS[patient_group])
    rh_ok = set(RED_CELL_DONORS["AB+" if patient_group.endswith("+") else "AB-"])
    return [g for g in BLOOD_GROUPS if g in abo_ok and g in rh_ok]


def compatible_donor_groups(patient_group: str, component: str) -> tuple[list[str], list[str]]:
    """
    Return (donor_groups, warnings) for a patient group and component.
    Raises CompatibilityError for combinations the rules do not cover.
    """
    if component not in ("RBC", "PLT", "FFP"):
        raise CompatibilityError(f"Unsupported component: {component}")

    if patient_group == UNKNOWN:
        if component not in UNKNOWN_GROUP_DEFAULT:
            raise CompatibilityError(
                f"{component} needs a known patient blood group. Group the patient, "
                "or request RBC (O−) or FFP (AB) under the unknown-group protocol."
            )
        return list(UNKNOWN_GROUP_DEFAULT[component]), [UNKNOWN_GROUP_WARNING[component]]

    if patient_group not in BLOOD_GROUPS:
        raise CompatibilityError(f"Unknown blood group value: {patient_group}")

    if component == "RBC":
        return list(RED_CELL_DONORS[patient_group]), []
    if component == "FFP":
        return list(PLASMA_DONORS[patient_group]), []
    return _plt_donors(patient_group), []


# ── 2. Unit safety filter ────────────────────────────────────────────────
# Exclusion reasons, in the order they are checked.
NOT_IN_STOCK = "not_in_stock"
TEMP_EXCURSION = "temperature_excursion"
EXPIRED = "expired"
UNTESTED = "untested_or_reactive"
ALREADY_HELD = "held_for_another_request"
WRONG_COMPONENT = "wrong_component"
INCOMPATIBLE = "incompatible_group"


def check_unit(unit: dict, *, component: str, donor_groups, as_of: date, held_unit_ids=frozenset()) -> str | None:
    """
    Return None if the unit is safe to offer, otherwise the reason it is excluded.

    `unit` keys: unit_id, component, blood_group, status, expiry_date (YYYY-MM-DD),
    temp_excursion_exposed (bool/int), screening_result, tested_date.
    """
    if unit["component"] != component:
        return WRONG_COMPONENT
    if unit["blood_group"] not in donor_groups:
        return INCOMPATIBLE
    if unit["status"] != "in_stock":
        return NOT_IN_STOCK
    if bool(unit["temp_excursion_exposed"]):
        return TEMP_EXCURSION
    if date.fromisoformat(str(unit["expiry_date"])[:10]) <= as_of:
        return EXPIRED
    # No quarantine column exists in the dataset; a unit counts as released for
    # use only if its donation was screened and non-reactive.
    if unit.get("screening_result") != "non_reactive" or not unit.get("tested_date"):
        return UNTESTED
    if unit["unit_id"] in held_unit_ids:
        return ALREADY_HELD
    return None


def filter_units(units, *, component, donor_groups, as_of, held_unit_ids=frozenset()):
    """Split units into (safe_units, excluded_counts_by_reason)."""
    safe, excluded = [], defaultdict(int)
    for u in units:
        reason = check_unit(u, component=component, donor_groups=donor_groups,
                            as_of=as_of, held_unit_ids=held_unit_ids)
        if reason is None:
            safe.append(u)
        else:
            excluded[reason] += 1
    return safe, dict(excluded)


# ── 3. Per-site pick and sufficiency ─────────────────────────────────────
def unit_preference(unit: dict, patient_group: str, component: str) -> tuple:
    """
    Sort key for which units a site sends first:
      1. exact group match
      2. other compatible groups
      3. universal-donor groups last (protects O− / AB reserves), unless the patient needs them
    then soonest expiry first (FEFO), then unit_id for a stable order.
    """
    group = unit["blood_group"]
    if group == patient_group:
        tier = 0
    elif group in UNIVERSAL_DONOR.get(component, set()) and patient_group != UNKNOWN:
        tier = 2
    else:
        tier = 1
    return (tier, str(unit["expiry_date"]), unit["unit_id"])


def pick_units(units, units_requested: int, patient_group: str, component: str) -> list[dict]:
    """The units one site would send, best first, at most units_requested."""
    ordered = sorted(units, key=lambda u: unit_preference(u, patient_group, component))
    return ordered[:units_requested]


@dataclass
class SiteOffer:
    facility_id: str
    units_available: int                 # safe, compatible units at the site
    picked: list = field(default_factory=list)

    def is_partial(self, units_requested: int) -> bool:
        return self.units_available < units_requested


def build_site_offers(safe_units, *, units_requested, patient_group, component,
                      requesting_facility_id, allowed_facility_ids=None) -> list[SiteOffer]:
    """
    Group safe units by site. Skips the requesting hospital itself and any site
    not allowed to supply. Sites with fewer units than requested are kept and
    marked partial by SiteOffer.is_partial().
    """
    by_site = defaultdict(list)
    for u in safe_units:
        site = u["current_facility_id"]
        if site == requesting_facility_id:
            continue
        if allowed_facility_ids is not None and site not in allowed_facility_ids:
            continue
        by_site[site].append(u)

    return [
        SiteOffer(facility_id=site, units_available=len(units),
                  picked=pick_units(units, units_requested, patient_group, component))
        for site, units in by_site.items()
    ]
