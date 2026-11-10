"""
Golden Hour — Database connection module.
Single source of truth for the SQLite DB path and connection factory.
"""
import sqlite3
import os
from contextlib import contextmanager

# Resolve DB path relative to this file
_BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(
    _BASE,
    "Terumo BCT Hackathon - Applicant_s Kit",
    "Starter Dataset",
    "blood_system.sqlite",
)


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


@contextmanager
def db():
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()
