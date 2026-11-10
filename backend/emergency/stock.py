"""
Read-only access to the starter dataset (blood_system.sqlite).

Opened with SQLite's mode=ro, so this code cannot change the provided data.
Safety rules are NOT applied in SQL; they live in rules.py where they can be
tested. The queries only narrow rows by component and group for speed.
"""

import sqlite3
from contextlib import contextmanager

from django.conf import settings


class StarterDataUnavailable(RuntimeError):
    pass


@contextmanager
def connect():
    path = settings.STARTER_DB_PATH
    if not path.exists() or path.stat().st_size == 0:
        raise StarterDataUnavailable(
            f"{path} is missing or empty. Run: python backend/scripts/build_starter_db.py"
        )
    con = sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        yield con
    finally:
        con.close()


def get_facility(facility_id: str) -> dict | None:
    with connect() as con:
        row = con.execute(
            "SELECT facility_id, name, facility_type, county, grid_reliability, connectivity, "
            "has_blood_fridge_backup_power FROM facilities WHERE facility_id = ?",
            (facility_id,),
        ).fetchone()
    return dict(row) if row else None


def facilities() -> dict[str, dict]:
    with connect() as con:
        rows = con.execute(
            "SELECT facility_id, name, facility_type, county, grid_reliability, connectivity, "
            "has_blood_fridge_backup_power FROM facilities"
        ).fetchall()
    return {r["facility_id"]: dict(r) for r in rows}


_CANDIDATE_UNITS_SQL = """
    SELECT u.unit_id, u.component, u.blood_group, u.expiry_date, u.status,
           u.temp_excursion_exposed, u.current_facility_id,
           d.screening_result, d.tested_date
    FROM units u
    LEFT JOIN donations d ON d.donation_id = u.donation_id
    WHERE u.status = 'in_stock' AND u.component = ? AND u.blood_group IN ({marks})
"""


def candidate_units(component: str, blood_groups: list[str]) -> list[dict]:
    """In-stock units of the component and groups, with their donation's screening result."""
    if not blood_groups:
        return []
    # Only a run of "?" placeholders is inserted into the SQL text; every value
    # (component and blood groups) is passed as a bound parameter below.
    marks = ",".join("?" * len(blood_groups))
    sql = _CANDIDATE_UNITS_SQL.format(marks=marks)  # nosec B608 - placeholders only, values are bound
    with connect() as con:
        rows = con.execute(sql, (component, *blood_groups)).fetchall()
    return [dict(r) for r in rows]


def routes_to(dest_id: str) -> dict[str, dict]:
    """Route table rows into one facility, keyed by source facility."""
    with connect() as con:
        rows = con.execute(
            "SELECT from_facility_id, road_km, typical_travel_hours, road_quality "
            "FROM routes WHERE to_facility_id = ?",
            (dest_id,),
        ).fetchall()
    return {r["from_facility_id"]: dict(r) for r in rows}
