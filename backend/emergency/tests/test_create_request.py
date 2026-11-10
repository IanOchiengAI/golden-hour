from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from emergency.models import AuditEvent, EmergencyRequest, Status, UnitHold
from emergency.rules import RED_CELL_DONORS

from .helpers import Actors, model_offline, needs_starter_data


@needs_starter_data
class CreateRequestTests(Actors, TestCase):
    def test_raise_matches_and_holds_top_site(self):
        r = self.raise_request()
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["status"], Status.AWAITING_DECISION)
        self.assertEqual(body["requesting_facility_id"], "HSP-002")
        self.assertEqual(body["compatible_groups"], RED_CELL_DONORS["O+"])
        self.assertIn(body["eta_method"], ("model", "fallback"))

        req = EmergencyRequest.objects.get(pk=body["id"])
        options = list(req.options.all())
        self.assertTrue(1 <= len(options) <= 3)
        top = options[0]
        self.assertNotEqual(top.facility_id, "HSP-002")      # never supplies itself

        holds = UnitHold.objects.filter(request=req, released_at__isnull=True)
        self.assertEqual({h.unit_id for h in holds}, set(top.unit_ids))
        self.assertEqual({h.facility_id for h in holds}, {top.facility_id})
        self.assertEqual(len(top.unit_ids), 2)
        self.assertTrue(set(top.blood_groups) <= {"O+", "O-"})

    def test_every_step_is_audited(self):
        req_id = self.raise_request().json()["id"]
        events = AuditEvent.objects.filter(request_id=req_id)
        self.assertEqual(
            [e.action for e in events],
            ["request_raised", "status_changed", "matching_completed", "units_held",
             "status_changed", "status_changed"],
        )
        self.assertEqual(
            [e.after["status"] for e in events if e.action == "status_changed"],
            [Status.MATCHING, Status.UNITS_HELD, Status.AWAITING_DECISION],
        )
        self.assertEqual(events[0].actor_username, "clin")
        self.assertEqual(events[2].actor_role, "system")

    def test_unknown_group_red_cells_get_only_o_negative(self):
        body = self.raise_request(patient_blood_group="unknown", units_requested=1).json()
        self.assertEqual(body["compatible_groups"], ["O-"])
        self.assertIn("O−", body["warnings"][0])
        req = EmergencyRequest.objects.get(pk=body["id"])
        for o in req.options.all():
            self.assertEqual(set(o.blood_groups), {"O-"})

    def test_unknown_group_plasma_gets_ab(self):
        body = self.raise_request(patient_blood_group="unknown", component="FFP", units_requested=1).json()
        self.assertEqual(body["compatible_groups"], ["AB-", "AB+"])
        req = EmergencyRequest.objects.get(pk=body["id"])
        for o in req.options.all():
            self.assertTrue(set(o.blood_groups) <= {"AB-", "AB+"})

    def test_unknown_group_platelets_refused(self):
        r = self.raise_request(patient_blood_group="unknown", component="PLT")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(EmergencyRequest.objects.exists())

    def test_second_request_does_not_get_held_units(self):
        first = EmergencyRequest.objects.get(pk=self.raise_request().json()["id"])
        second = EmergencyRequest.objects.get(pk=self.raise_request().json()["id"])
        first_ids = set(first.holds.values_list("unit_id", flat=True))
        second_ids = set(second.holds.values_list("unit_id", flat=True))
        self.assertTrue(first_ids and second_ids)
        self.assertFalse(first_ids & second_ids)

    def test_no_safe_stock_goes_to_handled_manually(self):
        # Platelets for an AB- patient need AB- platelets; the network has none.
        body = self.raise_request(patient_blood_group="AB-", component="PLT", units_requested=1).json()
        self.assertEqual(body["status"], Status.HANDLED_MANUALLY)
        self.assertFalse(UnitHold.objects.exists())

    def test_works_when_model_is_offline(self):
        with model_offline():
            body = self.raise_request().json()
        self.assertEqual(body["eta_method"], "fallback")
        req = EmergencyRequest.objects.get(pk=body["id"])
        self.assertTrue(req.options.exists())
        self.assertTrue(all(o.method == "fallback" for o in req.options.all()))
        self.assertEqual(req.status, Status.AWAITING_DECISION)

    def test_ml_crash_falls_back(self):
        with mock.patch("emergency.matching._ml_rank", side_effect=RuntimeError("boom")):
            body = self.raise_request().json()
        self.assertEqual(body["eta_method"], "fallback")


class CreateRequestAccessTests(Actors, TestCase):
    def test_requires_login(self):
        r = APIClient().post("/requests", {}, format="json")
        self.assertEqual(r.status_code, 401)

    def test_officer_cannot_raise_and_refusal_is_audited(self):
        r = self.officer_api.post("/requests", {}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertTrue(AuditEvent.objects.filter(action="access_denied", actor_username="officer").exists())

    def test_input_validation(self):
        bad = [
            {"units_requested": 0}, {"units_requested": 99}, {"patient_blood_group": "C+"},
            {"component": "WB"}, {"urgency": "whenever"},
        ]
        for over in bad:
            self.assertEqual(self.raise_request(**over).status_code, 400, over)
