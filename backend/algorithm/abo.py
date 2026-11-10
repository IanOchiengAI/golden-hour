"""
Golden Hour — ABO Compatibility Rules
Hard biological constraints. Never override without officer confirmation.
"""
from typing import List

# RBC / Whole Blood compatibility: donor_group → list of patient groups it can supply
_RBC_COMPAT: dict[str, List[str]] = {
    "O-":  ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
    "O+":  ["O+", "A+", "B+", "AB+"],
    "A-":  ["A-", "A+", "AB-", "AB+"],
    "A+":  ["A+", "AB+"],
    "B-":  ["B-", "B+", "AB-", "AB+"],
    "B+":  ["B+", "AB+"],
    "AB-": ["AB-", "AB+"],
    "AB+": ["AB+"],
}

# FFP/Plasma: compatibility REVERSED — AB is universal donor
_PLASMA_COMPAT: dict[str, List[str]] = {
    "AB+":  ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"],
    "AB-":  ["AB-", "A-", "B-", "O-"],
    "A+":   ["A+", "A-", "O+", "O-"],
    "A-":   ["A-", "O-"],
    "B+":   ["B+", "B-", "O+", "O-"],
    "B-":   ["B-", "O-"],
    "O+":   ["O+", "O-"],
    "O-":   ["O-"],
}

PLASMA_COMPONENTS = {"FFP", "CRYO"}

ALL_GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]

# Groups most likely to be in short supply (from data analysis)
RARE_GROUPS = {"O-", "B-", "A-"}

# Max shelf lives in days (for FEFO scoring)
MAX_SHELF_LIFE: dict[str, int] = {
    "RBC": 42,
    "WB":  35,
    "PLT": 5,
    "FFP": 365,
    "CRYO": 365,
}


def compatible_donor_groups(patient_group: str, component: str) -> List[str]:
    """
    Return list of donor blood groups that can supply this patient+component combo.
    For unknown patient group → return all groups (officer warning will fire).
    """
    if patient_group in (None, "unknown", ""):
        return ALL_GROUPS  # caller must surface O- recommendation warning

    if component in PLASMA_COMPONENTS:
        # Plasma: find all donors whose compatibility list includes patient_group
        return [
            donor for donor, recipients in _PLASMA_COMPAT.items()
            if patient_group in recipients
        ]
    else:
        # RBC, WB, PLT: standard ABO
        return [
            donor for donor, recipients in _RBC_COMPAT.items()
            if patient_group in recipients
        ]


def is_compatible(donor_group: str, patient_group: str, component: str) -> bool:
    """Check a single donor → patient compatibility."""
    return donor_group in compatible_donor_groups(patient_group, component)


def normalise_group(raw: str) -> str:
    """Clean up blood group strings from the DB (handles 'O negative' etc.)."""
    if not raw:
        return "unknown"
    s = raw.strip().upper().replace("POSITIVE", "+").replace("NEGATIVE", "-")
    s = s.replace("POS", "+").replace("NEG", "-")
    return s
