"""Loads the country rules file (config/<country>.yaml) once per process."""

from datetime import date
from functools import lru_cache

import yaml
from django.conf import settings

REQUIRED_KEYS = ("data_as_of", "emergency_authorisation", "urgency_targets_min", "options_count")


@lru_cache(maxsize=1)
def get_config() -> dict:
    with open(settings.COUNTRY_CONFIG_PATH, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    missing = [k for k in REQUIRED_KEYS if k not in cfg]
    if missing:
        raise RuntimeError(f"{settings.COUNTRY_CONFIG_PATH} is missing: {', '.join(missing)}")
    if cfg["emergency_authorisation"] not in ("standing", "per_transfer"):
        raise RuntimeError("emergency_authorisation must be 'standing' or 'per_transfer'")
    return cfg


def data_as_of() -> date:
    """The dataset's 'today'. YAML parses 2026-10-31 to a date already."""
    value = get_config()["data_as_of"]
    return value if isinstance(value, date) else date.fromisoformat(str(value))
