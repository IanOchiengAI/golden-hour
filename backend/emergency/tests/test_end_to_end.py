"""
End-to-end: drive a request from Raised to Received through the API only,
as the four screens would, then check the audit trail via GET /audit.
"""

from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from emergency.models import Status

from .helpers import Actors, model_offline, needs_starter_data

S = Status


@needs_starter_data
class EndToEndTests(Actors, TestCase):
    def ok(self, response, code=200):
        self.assertEqual(response.status_code, code, response.content)
        return response.json()

    def trail(self, rid):
        body = self.ok(self.officer_api.get(f"/audit?request_id={rid}"))
        self.assertEqual(body["request_id"], rid)
        return body

    def statuses(self, events):
        return [e["after"]["status"] for e in events if e["action"] == "status_changed"]

    def ship(self, dispatch):
        """Lab confirms and marks in transit; clinician confirms receipt."""
        lab = self.lab_api(dispatch["from_facility_id"])
        self.ok(lab.post(f"/dispatches/{dispatch['id']}/release", {"action": "confirm", "transport_mode": "vehicle"},
                         format="json"))
        self.ok(lab.post(f"/dispatches/{dispatch['id']}/status", {"status": "in_transit"}, format="json"))
        return self.ok(self.clin_api.post(f"/dispatches/{dispatch['id']}/status",
                                          {"status": "received", "coolbox_max_temp_c": 4.8}, format="json"))

    def test_urgent_request_with_moh_approval(self):
        # 1. Clinician raises; matching and auto-hold happen at once.
        req = self.ok(self.raise_request(urgency="urgent", units_requested=2), 201)
        rid = req["id"]
        self.assertEqual(req["status"], S.AWAITING_DECISION)

        # 2. Officer reads ranked options, then accepts the held one.
        opts = self.ok(self.officer_api.get(f"/requests/{rid}/options"))
        self.assertTrue(opts["options"][0]["is_held"])
        detail = self.ok(self.decide(rid, action="accept"))
        self.assertEqual(detail["status"], S.AWAITING_AUTHORISATION)

        # 3. MoH approves → dispatch created for the supplying lab.
        detail = self.ok(self.authorise(rid, action="approve", reason="Within protocol"))
        self.assertEqual(detail["status"], S.SENT_TO_SUPPLIER)
        dispatch = detail["dispatch"]
        self.assertEqual(dispatch["from_facility_id"], opts["options"][0]["facility_id"])

        # 4–6. Lab releases, marks in transit; clinician confirms receipt.
        final = self.ship(dispatch)
        self.assertEqual(final["request_status"], S.RECEIVED)
        self.assertEqual(final["warnings"], [])

        # 7. The audit trail has every step, in order.
        trail = self.trail(rid)
        self.assertEqual(trail["status"], S.RECEIVED)
        self.assertEqual(self.statuses(trail["events"]), [
            S.MATCHING, S.UNITS_HELD, S.AWAITING_DECISION, S.AWAITING_AUTHORISATION,
            S.SENT_TO_SUPPLIER, S.DISPATCHED, S.IN_TRANSIT, S.RECEIVED,
        ])
        actions = [e["action"] for e in trail["events"]]
        for expected in ("request_raised", "matching_completed", "units_held", "decision_accepted",
                         "authorisation_approved", "dispatch_created", "release_confirmed"):
            self.assertIn(expected, actions)
        by_action = {e["action"]: e for e in trail["events"]}
        self.assertEqual(by_action["request_raised"]["role"], "clinician")
        self.assertEqual(by_action["decision_accepted"]["role"], "blood_bank_officer")
        self.assertEqual(by_action["authorisation_approved"]["role"], "moh_officer")
        self.assertEqual(by_action["release_confirmed"]["role"], "lab_officer")

    def test_life_threatening_with_model_offline_and_a_supplier_decline(self):
        # Model offline: ranking falls back to the route table; the flow still completes.
        with model_offline():
            req = self.ok(self.raise_request(urgency="life_threatening", units_requested=1), 201)
        rid = req["id"]
        self.assertEqual(req["eta_method"], "fallback")
        self.assertTrue(self.ok(self.officer_api.get(f"/requests/{rid}/options"))["ai_offline"])

        # Standing authorisation: accept goes straight to the supplier, MoH notified.
        first = self.ok(self.decide(rid, action="accept"))["dispatch"]

        # First site declines → next site held → officer accepts again.
        lab1 = self.lab_api(first["from_facility_id"])
        declined = self.ok(lab1.post(f"/dispatches/{first['id']}/release",
                                     {"action": "decline", "reason": "No courier available"}, format="json"))
        self.assertEqual(declined["request_status"], S.AWAITING_DECISION)
        second = self.ok(self.decide(rid, action="accept"))["dispatch"]
        self.assertNotEqual(second["from_facility_id"], first["from_facility_id"])

        final = self.ship(second)
        self.assertEqual(final["request_status"], S.RECEIVED)

        trail = self.trail(rid)
        self.assertEqual(self.statuses(trail["events"]), [
            S.MATCHING, S.UNITS_HELD, S.AWAITING_DECISION, S.SENT_TO_SUPPLIER,
            S.UNITS_HELD, S.AWAITING_DECISION, S.SENT_TO_SUPPLIER, S.DISPATCHED, S.IN_TRANSIT, S.RECEIVED,
        ])
        actions = [e["action"] for e in trail["events"]]
        self.assertEqual(actions.count("moh_notified"), 2)
        self.assertIn("release_declined", actions)
        self.assertIn("holds_released", actions)


@needs_starter_data
class AuditEndpointTests(Actors, TestCase):
    def test_moh_can_read_and_lab_cannot(self):
        rid = self.raise_request().json()["id"]
        self.assertEqual(self.moh_api.get(f"/audit?request_id={rid}").status_code, 200)
        self.assertEqual(self.lab_api("RBTC-NBO").get(f"/audit?request_id={rid}").status_code, 403)
        self.assertEqual(self.clin_api.get(f"/audit?request_id={rid}").status_code, 403)
        self.assertEqual(APIClient().get(f"/audit?request_id={rid}").status_code, 401)

    def test_request_id_required_and_must_exist(self):
        self.assertEqual(self.officer_api.get("/audit").status_code, 400)
        self.assertEqual(self.officer_api.get("/audit?request_id=abc").status_code, 400)
        self.assertEqual(self.officer_api.get("/audit?request_id=999999").status_code, 404)

    def test_event_shape(self):
        rid = self.raise_request().json()["id"]
        first = self.officer_api.get(f"/audit?request_id={rid}").json()["events"][0]
        self.assertEqual(set(first), {"id", "time", "actor", "role", "action", "object", "before", "after", "reason"})
        self.assertEqual(first["action"], "request_raised")
        self.assertEqual(first["actor"], "clin")
