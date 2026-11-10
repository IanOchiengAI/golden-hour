from unittest import mock

from django.test import TestCase

from emergency.country import get_config
from emergency.models import AuditEvent, Dispatch, DispatchStatus, EmergencyRequest, Status, UnitHold

from .helpers import Actors, needs_starter_data

PATIENT_FIELDS = {"patient_blood_group", "clinical_note", "warnings", "compatible_groups"}


def config_with(**over):
    return mock.patch("emergency.services.get_config", return_value={**get_config(), **over})


def active_units(req_id):
    return set(UnitHold.objects.filter(request_id=req_id, released_at__isnull=True).values_list("unit_id", flat=True))


def actions(req_id):
    return list(AuditEvent.objects.filter(request_id=req_id).values_list("action", flat=True))


@needs_starter_data
class DecisionTests(Actors, TestCase):
    def raise_id(self, **over):
        return self.raise_request(**over).json()["id"]

    def test_accept_life_threatening_goes_straight_to_supplier_under_standing(self):
        rid = self.raise_id(urgency="life_threatening")
        held = active_units(rid)
        r = self.decide(rid, action="accept")
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["status"], Status.SENT_TO_SUPPLIER)
        self.assertEqual(body["authorisation_route"], "standing")
        self.assertEqual(body["dispatch"]["status"], DispatchStatus.AWAITING_RELEASE)
        self.assertEqual(set(body["dispatch"]["unit_ids"]), held)
        self.assertIn("decision_accepted", actions(rid))
        self.assertIn("moh_notified", actions(rid))

    def test_accept_urgent_waits_for_moh(self):
        rid = self.raise_id(urgency="urgent")
        body = self.decide(rid, action="accept").json()
        self.assertEqual(body["status"], Status.AWAITING_AUTHORISATION)
        self.assertEqual(body["authorisation_route"], "per_transfer")
        self.assertIsNone(body["dispatch"])

    def test_per_transfer_setting_makes_life_threatening_wait_for_moh(self):
        rid = self.raise_id(urgency="life_threatening")
        with config_with(emergency_authorisation="per_transfer"):
            body = self.decide(rid, action="accept").json()
        self.assertEqual(body["status"], Status.AWAITING_AUTHORISATION)

    def test_change_moves_the_hold(self):
        rid = self.raise_id(urgency="urgent")
        req = EmergencyRequest.objects.get(pk=rid)
        first, second = list(req.options.all())[:2]
        r = self.decide(rid, action="change", option_id=second.pk, reason="Rank 1 vehicle unavailable")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["held_option_id"], second.pk)
        self.assertEqual(active_units(rid), set(second.unit_ids))
        self.assertTrue(UnitHold.objects.filter(unit_id__in=first.unit_ids, released_at__isnull=False).exists())
        event = AuditEvent.objects.get(request_id=rid, action="decision_changed")
        self.assertEqual(event.before["option_id"], first.pk)
        self.assertEqual(event.after["option_id"], second.pk)
        self.assertEqual(event.reason, "Rank 1 vehicle unavailable")

    def test_change_to_units_just_taken_is_409_and_keeps_old_hold(self):
        rid = self.raise_id(urgency="urgent")
        req = EmergencyRequest.objects.get(pk=rid)
        first, second = list(req.options.all())[:2]
        other = EmergencyRequest.objects.get(pk=self.raise_id())
        UnitHold.objects.create(request=other, option=other.options.first(),
                                unit_id=second.unit_ids[0], facility_id=second.facility_id)
        r = self.decide(rid, action="change", option_id=second.pk, reason="try the second site")
        self.assertEqual(r.status_code, 409, r.content)
        self.assertEqual(active_units(rid), set(first.unit_ids))
        self.assertEqual(EmergencyRequest.objects.get(pk=rid).status, Status.AWAITING_DECISION)

    def test_reject_releases_and_hands_over(self):
        rid = self.raise_id()
        r = self.decide(rid, action="reject", reason="Patient transferred to another hospital")
        self.assertEqual(r.json()["status"], Status.HANDLED_MANUALLY)
        self.assertEqual(active_units(rid), set())
        self.assertEqual(AuditEvent.objects.get(request_id=rid, action="decision_rejected").reason,
                         "Patient transferred to another hospital")

    def test_input_errors(self):
        rid = self.raise_id()
        self.assertEqual(self.decide(rid, action="reject").status_code, 400)                  # no reason
        self.assertEqual(self.decide(rid, action="change", reason="x y z").status_code, 400)  # no option
        self.assertEqual(self.decide(rid, action="maybe").status_code, 400)
        other = EmergencyRequest.objects.get(pk=self.raise_id())
        r = self.decide(rid, action="change", option_id=other.options.first().pk, reason="wrong request")
        self.assertEqual(r.status_code, 404)

    def test_decision_in_wrong_status_is_409(self):
        rid = self.raise_id(urgency="life_threatening")
        self.decide(rid, action="accept")
        r = self.decide(rid, action="reject", reason="too late")
        self.assertEqual(r.status_code, 409)
        self.assertIn("SentToSupplier", r.json()["detail"])

    def test_only_officers_decide(self):
        rid = self.raise_id()
        r = self.clin_api.post(f"/requests/{rid}/decision", {"action": "accept"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_dispatch_shows_no_patient_fields(self):
        rid = self.raise_id(urgency="life_threatening")
        dispatch = self.decide(rid, action="accept").json()["dispatch"]
        self.assertFalse(PATIENT_FIELDS & set(dispatch), dispatch.keys())


@needs_starter_data
class AuthoriseTests(Actors, TestCase):
    def accepted(self, urgency="urgent"):
        rid = self.raise_request(urgency=urgency).json()["id"]
        self.decide(rid, action="accept")
        return rid

    def test_approve_sends_to_supplier(self):
        rid = self.accepted()
        r = self.authorise(rid, action="approve")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["status"], Status.SENT_TO_SUPPLIER)
        self.assertEqual(r.json()["dispatch"]["status"], DispatchStatus.AWAITING_RELEASE)
        self.assertIn("authorisation_approved", actions(rid))

    def test_reject_releases_hold(self):
        rid = self.accepted()
        r = self.authorise(rid, action="reject", reason="Outside protocol")
        self.assertEqual(r.json()["status"], Status.HANDLED_MANUALLY)
        self.assertEqual(active_units(rid), set())
        self.assertEqual(self.authorise(rid, action="reject").status_code, 400)   # reason required

    def test_stop_standing_route_before_release(self):
        rid = self.accepted(urgency="life_threatening")
        r = self.authorise(rid, action="stop", reason="Duplicate request")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["status"], Status.HANDLED_MANUALLY)
        self.assertEqual(Dispatch.objects.get(request_id=rid).status, DispatchStatus.CANCELLED)
        self.assertEqual(active_units(rid), set())

    def test_stop_not_allowed_on_per_transfer(self):
        rid = self.accepted()
        self.authorise(rid, action="approve")
        self.assertEqual(self.authorise(rid, action="stop", reason="changed my mind").status_code, 409)

    def test_review_standing_is_audit_only(self):
        rid = self.accepted(urgency="life_threatening")
        r = self.authorise(rid, action="review", reason="Appropriate use of standing authorisation")
        self.assertEqual(r.json()["status"], Status.SENT_TO_SUPPLIER)
        self.assertIn("authorisation_reviewed", actions(rid))
        self.assertEqual(self.authorise(self.accepted(), action="review").status_code, 409)

    def test_approve_in_wrong_status_is_409(self):
        rid = self.raise_request().json()["id"]   # still AwaitingDecision
        self.assertEqual(self.authorise(rid, action="approve").status_code, 409)

    def test_only_moh_authorises(self):
        rid = self.accepted()
        r = self.officer_api.post(f"/requests/{rid}/authorise", {"action": "approve"}, format="json")
        self.assertEqual(r.status_code, 403)
