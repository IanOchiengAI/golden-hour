#!/usr/bin/env python3
import sys
sys.stdout.reconfigure(encoding="utf-8")
"""
Golden Hour — End-to-End API Test Script
=========================================
Owner: Ian Ochieng
Purpose: Black-box test of the full dispatch flow against the running server.
         Hits the real API endpoints as the frontend / clients would.
         Standard library only (urllib) — runs on any OS without pip dependencies.

Usage:
    # 1. Start backend server in one terminal:
    #    cd backend && python manage.py runserver 8000

    # 2. Run this test script:
    #    python docs/e2e_test.py
    #    python docs/e2e_test.py --base http://127.0.0.1:8000
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple

DOMAIN = "goldenhour.health"
DEFAULT_BASE = "http://127.0.0.1:8000"

PASS = "✅"
FAIL = "❌"
WARN = "⚠️ "

TOTAL_CHECKS = 0
FAILED_CHECKS = 0


def check(label: str, condition: bool, detail: str = "") -> bool:
    global TOTAL_CHECKS, FAILED_CHECKS
    TOTAL_CHECKS += 1
    if condition:
        print(f"  {PASS}  {label}" + (f"  →  {detail}" if detail else ""))
        return True
    else:
        FAILED_CHECKS += 1
        print(f"  {FAIL}  {label}" + (f"  →  {detail}" if detail else ""))
        return False


def section(title: str):
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


class ApiClient:
    def __init__(self, base_url: str, password: str = "demo2026"):
        self.base = base_url.rstrip("/")
        self.password = password
        self.tokens: Dict[str, str] = {}

    def call(self, method: str, path: str, username: Optional[str] = None, body: Optional[dict] = None) -> Tuple[int, Any]:
        headers = {"Content-Type": "application/json"}
        if username:
            headers["Authorization"] = f"Token {self.token(username)}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                status = resp.status
                payload = json.loads(resp.read().decode("utf-8"))
                return status, payload
        except urllib.error.HTTPError as e:
            try:
                payload = json.loads(e.read().decode("utf-8"))
            except Exception:
                payload = {"error": str(e)}
            return e.code, payload
        except Exception as e:
            return 0, {"error": str(e)}

    def token(self, username: str) -> str:
        if username not in self.tokens:
            status, res = self.call("POST", "/auth/login", body={"username": username, "password": self.password})
            if status == 200 and "token" in res:
                self.tokens[username] = res["token"]
            else:
                raise RuntimeError(f"Login failed for {username}: {res}")
        return self.tokens[username]


def test_auth(api: ApiClient) -> bool:
    section("1. Authentication & Role Validation")
    roles = [
        f"clinician@{DOMAIN}",
        f"officer@{DOMAIN}",
        f"backup.officer@{DOMAIN}",
        f"moh@{DOMAIN}",
        f"lab@{DOMAIN}",
        f"lab.hsp-001@{DOMAIN}",
    ]
    all_ok = True
    for user in roles:
        try:
            tok = api.token(user)
            ok = check(f"Login as {user.split('@')[0]}", bool(tok), "token acquired")
            if not ok:
                all_ok = False
        except Exception as ex:
            check(f"Login as {user.split('@')[0]}", False, str(ex))
            all_ok = False
    return all_ok


def test_request_lifecycle(api: ApiClient):
    section("2. Clinician raises emergency request")
    clinician = f"clinician@{DOMAIN}"
    officer = f"officer@{DOMAIN}"
    moh = f"moh@{DOMAIN}"

    payload = {
        "component": "RBC",
        "patient_blood_group": "O+",
        "units_requested": 2,
        "urgency": "urgent",
        "clinical_note": "Post-partum haemorrhage — urgent resupply required",
    }
    status_code, req = api.call("POST", "/requests", clinician, payload)
    check("POST /requests returns 201 Created", status_code == 201, f"status: {status_code}")
    if status_code != 201:
        return

    req_id = req.get("id")
    check("Request has ID", req_id is not None, f"ID: {req_id}")
    check("Status progresses to AwaitingDecision or UnitsHeld", req.get("status") in ("UnitsHeld", "AwaitingDecision"), f"status: {req.get('status')}")
    check("Compatible groups identified", "O+" in req.get("compatible_groups", []) and "O-" in req.get("compatible_groups", []))

    section("3. Blood Bank Officer inspects ranked options")
    status_code, opts = api.call("GET", f"/requests/{req_id}/options", officer)
    check("GET /requests/{id}/options returns 200", status_code == 200)
    options_list = opts.get("options", [])
    check("Options list returned with >= 1 facility", len(options_list) >= 1, f"{len(options_list)} options")

    top_opt = options_list[0] if options_list else {}
    eta = top_opt.get("eta", {})
    check("Option has honest ETA bounds (low/mid/high)", all(k in eta for k in ("low_min", "mid_min", "high_min")), f"{eta.get('low_min')} - {eta.get('high_min')} min")
    check("Option has explainable reason", bool(top_opt.get("reason")), str(top_opt.get("reason", ""))[:65] + "...")
    check("Option has held flag", "is_held" in top_opt, f"is_held={top_opt.get('is_held')}")

    section("4. Officer decision: Accept recommendation")
    status_code, decision_res = api.call("POST", f"/requests/{req_id}/decision", officer, {"action": "accept"})
    check("POST /requests/{id}/decision returns 200", status_code == 200, f"status: {decision_res.get('status')}")

    current_status = decision_res.get("status")
    dispatch_info = decision_res.get("dispatch", {})

    if current_status == "AwaitingAuthorisation":
        section("4b. Ministry of Health Tiered Sign-Off")
        status_code, auth_res = api.call("POST", f"/requests/{req_id}/authorise", moh, {"action": "approve", "reason": "Within regional protocol"})
        check("POST /requests/{id}/authorise returns 200", status_code == 200, f"status: {auth_res.get('status')}")
        dispatch_info = auth_res.get("dispatch", dispatch_info)

    dispatch_id = dispatch_info.get("id")
    from_facility = dispatch_info.get("from_facility_id", "HSP-001")
    supplier_user = f"lab.{from_facility.lower()}@{DOMAIN}"

    section("5. Supplying Lab releases blood units")
    check("Dispatch ID generated", dispatch_id is not None, f"Dispatch #{dispatch_id} from {from_facility}")
    
    # Check KDPA privacy: supplying lab should not see clinical notes or patient blood group in dispatch
    patient_fields = {"patient_blood_group", "clinical_note", "warnings"} & set(dispatch_info)
    check("KDPA privacy: Lab cannot see patient-identifying clinical notes", len(patient_fields) == 0, f"Exposed fields: {sorted(patient_fields)}")

    status_code, rel_res = api.call("POST", f"/dispatches/{dispatch_id}/release", supplier_user, {"action": "confirm", "transport_mode": "vehicle"})
    check("POST /dispatches/{id}/release confirms dispatch", status_code == 200, f"status: {rel_res.get('request_status')}")

    section("6. Courier Transit & Hospital Receipt")
    status_code, trans_res = api.call("POST", f"/dispatches/{dispatch_id}/status", supplier_user, {"status": "in_transit"})
    check("Supplying lab transitions to in_transit", status_code == 200, f"status: {trans_res.get('request_status')}")

    # Clinician receives at hospital and confirms cold-chain intact (e.g. 4.6°C)
    status_code, rec_res = api.call("POST", f"/dispatches/{dispatch_id}/status", clinician, {"status": "received", "coolbox_max_temp_c": 4.6})
    check("Hospital clinician confirms arrival (Received)", status_code == 200, f"status: {rec_res.get('request_status')}")

    section("7. Immutable Audit Trail Verification")
    status_code, audit_res = api.call("GET", f"/audit?request_id={req_id}", officer)
    check("GET /audit returns 200 for officer", status_code == 200)
    events = audit_res.get("events", [])
    check("Audit trail records events across the flow", len(events) >= 4, f"{len(events)} logged events")

    # Verify role security: clinician cannot read audit trail
    status_code, _ = api.call("GET", f"/audit?request_id={req_id}", clinician)
    check("Role isolation: Clinician forbidden from /audit (HTTP 403)", status_code == 403)


def main():
    parser = argparse.ArgumentParser(description="Golden Hour E2E Test Suite")
    parser.add_argument("--base", default=DEFAULT_BASE, help=f"Backend base URL (default: {DEFAULT_BASE})")
    parser.add_argument("--password", default="demo2026", help="Demo user password")
    args = parser.parse_args()

    print(f"\n{'=' * 65}")
    print(f"  GOLDEN HOUR — END-TO-END VERIFICATION")
    print(f"  Target: {args.base}")
    print(f"{'=' * 65}")

    api = ApiClient(args.base, args.password)

    # Health check
    try:
        urllib.request.urlopen(args.base + "/requests", timeout=5)
    except urllib.error.HTTPError as e:
        # 401 is expected when unauthenticated, meaning server is alive
        pass
    except Exception as ex:
        print(f"\n{FAIL} Cannot connect to server at {args.base}: {ex}")
        print("   Start server first: cd backend && python manage.py runserver 8000")
        sys.exit(1)

    auth_ok = test_auth(api)
    if not auth_ok:
        print(f"\n{FAIL} Auth failed. Ensure 'python manage.py seed_demo_users' has run.")
        sys.exit(1)

    test_request_lifecycle(api)

    print(f"\n{'=' * 65}")
    print(f"  SUMMARY: {TOTAL_CHECKS - FAILED_CHECKS}/{TOTAL_CHECKS} checks passed.")
    if FAILED_CHECKS == 0:
        print(f"  {PASS} ALL CHECKS PASSED. Ready for demo / submission!")
    else:
        print(f"  {FAIL} {FAILED_CHECKS} CHECKS FAILED.")
    print(f"{'=' * 65}\n")

    sys.exit(0 if FAILED_CHECKS == 0 else 1)


if __name__ == "__main__":
    main()
