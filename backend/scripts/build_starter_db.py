"""
Rebuild the starter SQLite database from the provided CSVs.

Why: blood_system.sqlite was committed to the repo as a 0-byte file, so every
table is missing. The dataset README says the SQLite file is "all of the above
as one SQLite database", and gen.py builds it with pandas.to_sql from the same
frames it writes to CSV. This script does the same thing from the CSVs, so the
tables, column names and value formats match the original.

The CSVs are never modified. The generated .sqlite file is large and is NOT
committed - each developer runs this once:

    python backend/scripts/build_starter_db.py
"""

import sqlite3
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATASET = ROOT / "Terumo BCT Hackathon - Applicant_s Kit" / "Starter Dataset"
DB_PATH = DATASET / "blood_system.sqlite"

TABLES = [
    "facilities", "routes", "donors", "drives", "donations", "units",
    "transfers", "requests", "daily_stock", "power_outages", "temperature_logs",
]

# Lookups the API runs on every request.
INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_units_avail ON units (status, component, blood_group, current_facility_id)",
    "CREATE INDEX IF NOT EXISTS ix_routes_pair ON routes (from_facility_id, to_facility_id)",
    "CREATE INDEX IF NOT EXISTS ix_daily_stock ON daily_stock (date, facility_id)",
]


def main(force: bool = False) -> None:
    if DB_PATH.exists() and DB_PATH.stat().st_size > 0 and not force:
        print(f"{DB_PATH.name} already has data; pass --force to rebuild.")
        return

    tmp = DB_PATH.with_suffix(".sqlite.tmp")
    if tmp.exists():
        tmp.unlink()
    con = sqlite3.connect(tmp)
    try:
        for name in TABLES:
            df = pd.read_csv(DATASET / f"{name}.csv", low_memory=False)
            df.to_sql(name, con, index=False)
            print(f"  {name:<18} {len(df):>8,} rows")
        for sql in INDEXES:
            con.execute(sql)
        con.commit()
    finally:
        con.close()
    tmp.replace(DB_PATH)
    print(f"Built {DB_PATH}")


if __name__ == "__main__":
    main(force="--force" in sys.argv)
