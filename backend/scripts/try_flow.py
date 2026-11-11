"""
Walk one request from Raised to Received against a running server, printing
each step. Standard library only, so it runs the same on Windows, macOS and Linux.

    python scripts/try_flow.py                          # urgent: officer accept → MoH approve → … → received
    python scripts/try_flow.py --urgency life_threatening   # standing authorisation: skips MoH approval
    python scripts/try_flow.py --decline                # first supplier declines → next site → received
    python scripts/try_flow.py --base http://127.0.0.1:8000 --password demo2026

Needs: server running (python manage.py runserver 8000) and demo users
(python manage.py seed_demo_users).
"""

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

DOMAIN = "goldenhour.health"


class Api:
    def __init__(self, base, password):
        if urllib.parse.urlparse(base).scheme not in ("http", "https"):
            sys.exit(f"--base must be an http:// or https:// URL, got {base!r}")
        self.base, self.password, self.tokens = base.rstrip("/"), password, {}

    def call(self, method, path, user=None, body=None):
        headers = {"Content-Type": "application/json"}
        if user:
            headers["Authorization"] = f"Token {self.token(user)}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:  # nosec B310 - scheme checked in __init__
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            sys.exit(f"\n✗ {method} {path} as {user} → {e.code}: {e.read().decode('utf-8')}")
        except urllib.error.URLError as e:
            sys.exit(f"\n✗ Cannot reach {self.base} ({e.reason}). Is the server running?")

    def token(self, user):
        if user not in self.tokens:
            self.tokens[user] = self.call("POST", "/auth/login", body={"username": user, "password": self.password})["token"]
        return self.tokens[user]


def step(n, text):
    print(f"\n[{n}] {text}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--base", default="http://127.0.0.1:8000")
    p.add_argument("--password", default="demo2026")
    p.add_argument("--urgency", default="urgent", choices=["life_threatening", "urgent", "routine"])
    p.add_argument("--group", default="O+", help="patient blood group, or 'unknown'")
    p.add_argument("--units", type=int, default=2)
    p.add_argument("--decline", action="store_true", help="first supplier declines")
    a = p.parse_args()
    api = Api(a.base, a.password)
    clinician, officer, moh = f"clinician@{DOMAIN}", f"officer@{DOMAIN}", f"moh@{DOMAIN}"
    lab = lambda facility_id: f"lab.{facility_id.lower()}@{DOMAIN}"

    step(1, f"Clinician raises: {a.group} RBC x{a.units}, {a.urgency}")
    req = api.call("POST", "/requests", clinician, {"patient_blood_group": a.group, "component": "RBC",
                                                     "units_requested": a.units, "urgency": a.urgency})
    rid = req["id"]
    print(f"    request {rid}: {req['status']} · groups {req['compatible_groups']} · ETA method {req['eta_method']}")
    for w in req["warnings"]:
        print(f"    ⚠ {w}")
    if req["status"] != "AwaitingDecision":
        sys.exit("    No safe compatible stock — handled manually. Stop.")

    step(2, "Officer reads ranked options")
    opts = api.call("GET", f"/requests/{rid}/options", officer)
    for o in opts["options"]:
        eta = o["eta"]
        print(f"    #{o['rank']} {o['facility_name']:<45} ETA {eta['low_min']:.0f}–{eta['high_min']:.0f} min"
              f"{'  [HELD]' if o['is_held'] else ''}{'  [partial]' if o['is_partial'] else ''}")
    if opts["ai_offline"]:
        print("    ⚠ AI offline — ETAs from the route table")

    n = 3
    while True:
        step(n, "Officer accepts the held site"); n += 1
        detail = api.call("POST", f"/requests/{rid}/decision", officer, {"action": "accept"})
        print(f"    → {detail['status']} (route: {detail['authorisation_route']})")

        if detail["status"] == "AwaitingAuthorisation":
            step(n, "MoH officer approves"); n += 1
            detail = api.call("POST", f"/requests/{rid}/authorise", moh, {"action": "approve", "reason": "Within protocol"})
            print(f"    → {detail['status']}")

        d = detail["dispatch"]
        supplier = lab(d["from_facility_id"])
        if a.decline:
            a.decline = False
            step(n, f"Supplying lab ({supplier}) declines"); n += 1
            r = api.call("POST", f"/dispatches/{d['id']}/release", supplier, {"action": "decline", "reason": "No courier available"})
            print(f"    → dispatch {r['dispatch']['status']}, request {r['request_status']} (next site held)")
            if r["request_status"] != "AwaitingDecision":
                sys.exit("    No other site available. Stop.")
            continue
        break

    step(n, f"Supplying lab ({supplier}) confirms release"); n += 1
    r = api.call("POST", f"/dispatches/{d['id']}/release", supplier, {"action": "confirm", "transport_mode": "vehicle"})
    print(f"    → request {r['request_status']} · units {r['dispatch']['unit_ids']}")
    patient_fields = {"patient_blood_group", "clinical_note", "warnings"} & set(r["dispatch"])
    print(f"    lab sees patient fields: {sorted(patient_fields) or 'none'}")

    step(n, "Supplying lab marks in transit"); n += 1
    r = api.call("POST", f"/dispatches/{d['id']}/status", supplier, {"status": "in_transit"})
    print(f"    → {r['request_status']}")

    step(n, "Clinician confirms receipt (cool box 4.8 °C)"); n += 1
    r = api.call("POST", f"/dispatches/{d['id']}/status", clinician, {"status": "received", "coolbox_max_temp_c": 4.8})
    print(f"    → {r['request_status']}")

    step(n, "Audit trail (GET /audit)")
    trail = api.call("GET", f"/audit?request_id={rid}", officer)
    for e in trail["events"]:
        status = (e["after"] or {}).get("status", "") if e["action"] == "status_changed" else ""
        print(f"    {e['time'][11:19]}  {e['role']:<19} {e['action']:<24} {status}")
    print(f"\n✓ Request {rid} finished as {trail['status']}")


if __name__ == "__main__":
    main()
