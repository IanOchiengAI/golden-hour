from django.test import TestCase

from accounts.models import Role
from emergency.models import AuditEvent, Dispatch, DispatchStatus, EmergencyRequest, Status, UnitHold
from emergency.services import active_held_unit_ids

from .helpers import Actors, client_for, make_user, needs_starter_data


@needs_starter_data
class DispatchTests(Actors, TestCase):
    def sent_to_supplier(self, **over):
        """Raise a life-threatening request and accept it → SentToSupplier with a dispatch (standing route)."""
        rid = self.raise_request(urgency="life_threatening", **over).json()["id"]
        body = self.decide(rid, action="accept").json()
        return rid, Dispatch.objects.get(pk=body["dispatch"]["id"])

    def release(self, d, **body):
        return self.lab_api(d.from_facility_id).post(f"/dispatches/{d.pk}/release", body, format="json")

    def set_status(self, d, api, **body):
        return api.post(f"/dispatches/{d.pk}/status", body, format="json")

    # ── release ──────────────────────────────────────────────────────────
    def test_confirm_dispatches_and_consumes_units(self):
        rid, d = self.sent_to_supplier()
        r = self.release(d, action="confirm", transport_mode="motorbike")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["dispatch"]["status"], DispatchStatus.RELEASED)
        self.assertEqual(r.json()["request_status"], Status.DISPATCHED)
        holds = UnitHold.objects.filter(request_id=rid, unit_id__in=d.unit_ids)
        self.assertTrue(all(h.consumed_at and h.released_at is None for h in holds))

    def test_dispatched_units_never_offered_again(self):
        _, d = self.sent_to_supplier()
        self.release(d, action="confirm")
        self.assertTrue(set(d.unit_ids) <= active_held_unit_ids())
        new = EmergencyRequest.objects.get(pk=self.raise_request().json()["id"])
        offered = {u for o in new.options.all() for u in o.unit_ids}
        self.assertFalse(offered & set(d.unit_ids))

    def test_only_the_supplying_lab_releases(self):
        _, d = self.sent_to_supplier()
        other_site = "RBTC-MSA" if d.from_facility_id != "RBTC-MSA" else "RBTC-KSM"
        r = self.lab_api(other_site).post(f"/dispatches/{d.pk}/release", {"action": "confirm"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertTrue(AuditEvent.objects.filter(action="access_denied", object_id__contains="release").exists())
        r = self.clin_api.post(f"/dispatches/{d.pk}/release", {"action": "confirm"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_confirm_twice_is_409(self):
        _, d = self.sent_to_supplier()
        self.release(d, action="confirm")
        self.assertEqual(self.release(d, action="confirm").status_code, 409)

    def test_decline_holds_next_site_and_returns_to_officer(self):
        rid, d = self.sent_to_supplier()
        r = self.release(d, action="decline", reason="Fridge alarm, cannot release now")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["dispatch"]["status"], DispatchStatus.DECLINED)
        self.assertEqual(r.json()["request_status"], Status.AWAITING_DECISION)
        req = EmergencyRequest.objects.get(pk=rid)
        nxt = req.options.get(rank=d.option.rank + 1)
        active = set(req.holds.filter(released_at__isnull=True).values_list("unit_id", flat=True))
        self.assertEqual(active, set(nxt.unit_ids))
        self.assertIn("release_declined", AuditEvent.objects.filter(request_id=rid).values_list("action", flat=True))
        # Officer accepts again → a new dispatch to the next site.
        body = self.decide(rid, action="accept").json()
        self.assertEqual(body["dispatch"]["from_facility_id"], nxt.facility_id)
        self.assertEqual(body["dispatch"]["status"], DispatchStatus.AWAITING_RELEASE)

    def test_decline_at_every_site_hands_over(self):
        rid, d = self.sent_to_supplier()
        n_options = EmergencyRequest.objects.get(pk=rid).options.count()
        for _ in range(n_options):
            r = self.release(d, action="decline", reason="No courier available")
            if r.json()["request_status"] != Status.AWAITING_DECISION:
                break
            d = Dispatch.objects.get(pk=self.decide(rid, action="accept").json()["dispatch"]["id"])
        self.assertEqual(r.json()["request_status"], Status.HANDLED_MANUALLY)
        self.assertFalse(UnitHold.objects.filter(request_id=rid, released_at__isnull=True).exists())

    def test_decline_needs_reason(self):
        _, d = self.sent_to_supplier()
        self.assertEqual(self.release(d, action="decline").status_code, 400)

    # ── status ───────────────────────────────────────────────────────────
    def test_in_transit_then_received(self):
        rid, d = self.sent_to_supplier()
        self.release(d, action="confirm")
        r = self.set_status(d, self.lab_api(d.from_facility_id), status="in_transit")
        self.assertEqual(r.json()["request_status"], Status.IN_TRANSIT)
        r = self.set_status(d, self.clin_api, status="received", coolbox_max_temp_c=5.2)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["request_status"], Status.RECEIVED)
        self.assertEqual(r.json()["warnings"], [])

    def test_received_before_in_transit_is_409(self):
        _, d = self.sent_to_supplier()
        self.release(d, action="confirm")
        self.assertEqual(self.set_status(d, self.clin_api, status="received").status_code, 409)

    def test_right_person_for_each_status(self):
        _, d = self.sent_to_supplier()
        self.release(d, action="confirm")
        self.assertEqual(self.set_status(d, self.clin_api, status="in_transit").status_code, 403)
        self.set_status(d, self.lab_api(d.from_facility_id), status="in_transit")
        self.assertEqual(self.set_status(d, self.lab_api(d.from_facility_id), status="received").status_code, 403)
        elsewhere = client_for(make_user("clin-elsewhere", Role.CLINICIAN, "HSP-012"))
        self.assertEqual(self.set_status(d, elsewhere, status="received").status_code, 403)

    def test_warm_coolbox_on_arrival_is_flagged(self):
        rid, d = self.sent_to_supplier()
        self.release(d, action="confirm")
        self.set_status(d, self.lab_api(d.from_facility_id), status="in_transit")
        r = self.set_status(d, self.clin_api, status="received", coolbox_max_temp_c=11.2)
        self.assertEqual(r.json()["request_status"], Status.RECEIVED)
        self.assertIn("quarantine", r.json()["warnings"][0])
        self.assertTrue(AuditEvent.objects.filter(request_id=rid, action="cold_chain_excursion_on_arrival").exists())
