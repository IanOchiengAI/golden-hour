#!/usr/bin/env python3
"""
Golden Hour — End-to-End API Test Script
=========================================
Owner: Ian Ochieng
Purpose: Black-box test of the full dispatch flow against Roland's running server.
         Does NOT touch backend code — hits the API as the frontend would.

Usage:
    # 1. Start Roland's server in one terminal:
    #    cd backend && python manage.py runserver

    # 2. Run this script in another terminal (from the repo root):
    #    python docs/e2e_test.py

    # 3. To test against a deployed URL:
    #    python docs/e2e_test.py --base-url https://golden-hour.onrender.com

Flow tested:
    POST /auth/login          (get token for each role)
    POST /requests            (clinician raises emergency request)
    GET  /requests/{id}/options  (officer sees ranked options with ETA)
    POST /requests/{id}/decision (officer accepts)
    POST /dispatches/{id}/release (lab officer confirms release)
    POST /dispatches/{id}/status  (courier updates: dispatched → in_transit → received)
    GET  /audit?request_id=   (full audit trail visible)
"""

import argparse
import json
import sys
import time

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed. Run: pip install requests")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
DEFAULT_BASE = "http://localhost:8000"

USERS = {
    "clinician":      {"email": "clinician@goldenhour.health",      "password": "demo2026"},
    "officer":        {"email": "officer@goldenhour.health",         "password": "demo2026"},
    "lab":            {"email": "lab@goldenhour.health",             "password": "demo2026"},
    "backup_officer": {"email": "backup.officer@goldenhour.health",  "password": "demo2026"},
}

PASS = "✅"
FAIL = "❌"
WARN = "⚠️ "


# ── Helpers ───────────────────────────────────────────────────────────────────
def check(label, condition, detail=""):
    status = PASS if condition else FAIL
    print(f"  {status}  {label}" + (f"  →  {detail}" if detail else ""))
    return condition


def section(title):
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


def login(base, role):
    creds = USERS[role]
    r = requests.post(f"{base}/auth/login", json=creds, timeout=10)
    if r.status_code == 200:
        token = r.json().get("token") or r.json().get("key") or r.json().get("auth_token")
        return token
    return None


def auth(token):
    return {"Authorization": f"Token {token}"}


# ── Test Suites ───────────────────────────────────────────────────────────────
def test_auth(base):
    section("1. Authentication")
    tokens = {}
    all_ok = True
    for role in USERS:
        token = login(base, role)
        ok = check(f"Login as {role}", token is not None,
                   "got token" if token else f"HTTP error — check seed_demo_users was run")
        if ok:
            tokens[role] = token
        else:
            all_ok = False
    return tokens, all_ok


def test_raise_request(base, tokens):
    section("2. Clinician raises emergency request")
    if "clinician" not in tokens:
        print(f"  {WARN} Skipped — clinician token missing")
        return None

    payload = {
        "component": "RBC",
        "patient_blood_group": "O+",
        "units_needed": 2,
        "urgency": "emergency",
        "notes": "Obstetric haemorrhage — post-partum, requires immediate dispatch",
    }
    r = requests.post(f"{base}/requests", json=payload,
                      headers=auth(tokens["clinician"]), timeout=15)

    check("POST /requests returns 201", r.status_code == 201,
          f"got {r.status_code}: {r.text[:120]}")

    if r.status_code != 201:
        return None

    data = r.json()
    req_id = data.get("id") or data.get("request_id")
    status = data.get("status")

    check("Response has an ID", req_id is not None, str(req_id))
    check("Status moves past 'Raised'",
          status not in (None, "Raised"),
          f"status = {status!r}  (expected Matching / UnitsHeld / AwaitingDecision)")

    return req_id


def test_get_options(base, tokens, req_id):
    section("3. Blood bank officer views ranked options")
    if "officer" not in tokens or req_id is None:
        print(f"  {WARN} Skipped — officer token or request ID missing")
        return None

    r = requests.get(f"{base}/requests/{req_id}/options",
                     headers=auth(tokens["officer"]), timeout=15)

    check("GET /requests/{id}/options returns 200", r.status_code == 200,
          f"got {r.status_code}: {r.text[:120]}")

    if r.status_code != 200:
        return None

    options = r.json()
    if isinstance(options, dict):
        options = options.get("options") or options.get("results") or [options]

    check("At least one option returned", len(options) >= 1, f"{len(options)} option(s)")

    if not options:
        return None

    top = options[0]
    dispatch_id = top.get("dispatch_id") or top.get("id") or top.get("option_id")

    check("Option has eta_low_min",  "eta_low_min"  in top, str(top.get("eta_low_min")))
    check("Option has eta_mid_min",  "eta_mid_min"  in top, str(top.get("eta_mid_min")))
    check("Option has eta_high_min", "eta_high_min" in top, str(top.get("eta_high_min")))
    check("Option has plain-language reason", "reason" in top,
          (top.get("reason") or "")[:80])
    check("Option has eta_method (model|fallback)", "eta_method" in top,
          str(top.get("eta_method")))

    method = top.get("eta_method", "")
    if method == "fallback":
        print(f"  {WARN}  eta_method=fallback — ML model is offline or pkl missing."
              f" Run: python -m ml.train_eta")
    else:
        check("eta_method = 'model' (ML running)", method == "model", method)

    # ETA range sanity: low < mid < high
    lo, mid, hi = top.get("eta_low_min"), top.get("eta_mid_min"), top.get("eta_high_min")
    if all(v is not None for v in (lo, mid, hi)):
        check("ETA range is ordered (low < mid < high)", lo <= mid <= hi,
              f"{lo:.0f}–{mid:.0f}–{hi:.0f} min")

    return dispatch_id


def test_decision(base, tokens, req_id, dispatch_id):
    section("4. Officer accepts the top option")
    if "officer" not in tokens or req_id is None:
        print(f"  {WARN} Skipped")
        return None

    payload = {
        "decision": "accept",
        "option_id": dispatch_id,
        "reason": "Closest site with O+ stock and no cold-chain issues",
    }
    r = requests.post(f"{base}/requests/{req_id}/decision", json=payload,
                      headers=auth(tokens["officer"]), timeout=10)

    check("POST /requests/{id}/decision returns 200 or 201",
          r.status_code in (200, 201), f"got {r.status_code}: {r.text[:120]}")

    if r.status_code not in (200, 201):
        return None

    data = r.json()
    new_status = data.get("status")
    check("Status progresses after accept",
          new_status not in (None, "AwaitingDecision"),
          f"status = {new_status!r}")

    # Confirm idempotency guard: second accept should fail
    r2 = requests.post(f"{base}/requests/{req_id}/decision", json=payload,
                       headers=auth(tokens["officer"]), timeout=10)
    check("Second accept is rejected (not idempotent)",
          r2.status_code in (400, 409, 422),
          f"got {r2.status_code} (expected 4xx)")

    return dispatch_id


def test_release(base, tokens, dispatch_id):
    section("5. Lab officer confirms unit release")
    if "lab" not in tokens or dispatch_id is None:
        print(f"  {WARN} Skipped — lab token or dispatch ID missing")
        return False

    payload = {"action": "confirm", "notes": "Unit verified, cold box packed, courier ready"}
    r = requests.post(f"{base}/dispatches/{dispatch_id}/release", json=payload,
                      headers=auth(tokens["lab"]), timeout=10)

    check("POST /dispatches/{id}/release returns 200 or 201",
          r.status_code in (200, 201), f"got {r.status_code}: {r.text[:120]}")

    if r.status_code not in (200, 201):
        # Try decline to verify that path also exists
        r_dec = requests.post(f"{base}/dispatches/{dispatch_id}/release",
                              json={"action": "decline", "notes": "Unit missing from fridge"},
                              headers=auth(tokens["lab"]), timeout=10)
        check("Decline path also exists (4xx or 2xx)",
              r_dec.status_code < 500, f"got {r_dec.status_code}")
        return False

    return True


def test_status_updates(base, tokens, dispatch_id, released):
    section("6. Status updates: dispatched → in_transit → received")
    if dispatch_id is None or not released:
        print(f"  {WARN} Skipped — dispatch not released")
        return

    for new_status in ("dispatched", "in_transit", "received"):
        payload = {"status": new_status}
        if new_status == "received":
            payload["notes"] = "Blood received by ward nurse, temperature intact"

        r = requests.post(f"{base}/dispatches/{dispatch_id}/status", json=payload,
                          headers=auth(tokens.get("officer") or next(iter(tokens.values()))),
                          timeout=10)
        check(f"POST /dispatches/{{id}}/status → {new_status}",
              r.status_code in (200, 201), f"got {r.status_code}: {r.text[:80]}")
        time.sleep(0.3)   # brief pause between transitions


def test_audit(base, tokens, req_id):
    section("7. Audit trail")
    if not tokens or req_id is None:
        print(f"  {WARN} Skipped")
        return

    # Try any available token
    token = tokens.get("officer") or next(iter(tokens.values()))
    r = requests.get(f"{base}/audit", params={"request_id": req_id},
                     headers=auth(token), timeout=10)

    check("GET /audit?request_id= returns 200", r.status_code == 200,
          f"got {r.status_code}: {r.text[:120]}")

    if r.status_code != 200:
        return

    events = r.json()
    if isinstance(events, dict):
        events = events.get("events") or events.get("results") or []

    check("At least one audit event recorded", len(events) >= 1,
          f"{len(events)} event(s)")

    # Check event shape
    if events:
        ev = events[0]
        for field in ("who", "action", "timestamp"):
            check(f"Audit event has '{field}'", field in ev, str(ev.get(field, "MISSING")))


def test_role_isolation(base, tokens):
    section("8. Role isolation — clinician cannot see officer endpoints")
    if "clinician" not in tokens:
        print(f"  {WARN} Skipped")
        return

    # Clinician should not be able to call /audit
    r = requests.get(f"{base}/audit", headers=auth(tokens["clinician"]), timeout=10)
    check("Clinician cannot access /audit (expects 403)",
          r.status_code == 403, f"got {r.status_code}")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Golden Hour end-to-end API test")
    parser.add_argument("--base-url", default=DEFAULT_BASE,
                        help=f"Base URL of the running server (default: {DEFAULT_BASE})")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    print(f"\n{'=' * 60}")
    print(f"  GOLDEN HOUR — END-TO-END API TEST")
    print(f"  Target: {base}")
    print(f"{'=' * 60}")

    # Smoke test
    try:
        requests.get(base, timeout=5)
    except Exception:
        print(f"\n{FAIL}  Cannot reach {base}")
        print("     Make sure the server is running: cd backend && python manage.py runserver")
        sys.exit(1)

    tokens, auth_ok = test_auth(base)
    if not auth_ok:
        print(f"\n{FAIL}  Auth failed — run 'python manage.py seed_demo_users' and retry.")
        sys.exit(1)

    req_id      = test_raise_request(base, tokens)
    dispatch_id = test_get_options(base, tokens, req_id)
    dispatch_id = test_decision(base, tokens, req_id, dispatch_id)
    released    = test_release(base, tokens, dispatch_id)
    test_status_updates(base, tokens, dispatch_id, released)
    test_audit(base, tokens, req_id)
    test_role_isolation(base, tokens)

    print(f"\n{'=' * 60}")
    print("  Done. Fix any ❌ before the 23:30 gate.")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()
