"""
Integration with Ian's ml/ package (GitHub issue #5):
1. ETA method comes from rank_candidates' eta_method, not a private function.
2. as_of (data_as_of from config/kenya.yaml) is passed to rank_candidates.
3. national_group_stock is always sent, so the scarcity score is national.
4. Race on the unit hold: a conflicting hold triggers a re-match; if it keeps
   failing, the request is handed over with the reason recorded — never a silent drop.
"""

from datetime import date
from unittest import mock

from django.test import TestCase

import ml.ranking
from emergency import services
from emergency.models import AuditEvent, EmergencyRequest, Status, UnitHold

from .helpers import Actors, needs_starter_data


def spy_rank():
    """Wrap the real rank_candidates so the test can inspect what the backend sent."""
    return mock.patch("ml.ranking.rank_candidates", wraps=ml.ranking.rank_candidates)


@needs_starter_data
class RankCallTests(Actors, TestCase):
    def test_as_of_and_national_stock_are_passed(self):
        with spy_rank() as rank, self.assertNoLogs("ml.ranking", level="WARNING"):
            self.raise_request(patient_blood_group="O+", units_requested=1)
        kwargs = rank.call_args.kwargs
        self.assertEqual(kwargs["as_of"], date(2026, 10, 31))
        for cand in kwargs["candidates"]:
            self.assertIn("national_group_stock", cand)
            self.assertGreaterEqual(cand["national_group_stock"], cand["units_available_at_facility"])

    def test_national_stock_counts_this_component_only(self):
        # O- red cells are scarce (single digits nationally); O- plasma is not.
        # Mixing components would hide the O- red-cell shortage.
        with spy_rank() as rank:
            self.raise_request(patient_blood_group="unknown", units_requested=1)
        o_neg = {c["national_group_stock"] for c in rank.call_args.kwargs["candidates"]}
        self.assertEqual(len(o_neg), 1)
        self.assertLess(o_neg.pop(), 20)

    def test_method_comes_from_ranked_results(self):
        real = ml.ranking.rank_candidates

        def one_site_on_fallback(**kwargs):
            ranked = real(**kwargs)
            ranked[-1]["eta_method"] = "fallback"
            return ranked

        with mock.patch("ml.ranking.rank_candidates", side_effect=one_site_on_fallback):
            body = self.raise_request().json()
        self.assertEqual(body["eta_method"], "fallback")   # any fallback ETA → AI offline banner
        req = EmergencyRequest.objects.get(pk=body["id"])
        self.assertTrue(all(o.method in ("model", "fallback") for o in req.options.all()))

    def test_all_model_etas_report_model(self):
        self.assertEqual(self.raise_request().json()["eta_method"], "model")

    def test_no_stock_has_no_method(self):
        body = self.raise_request(patient_blood_group="AB-", component="PLT", units_requested=1).json()
        self.assertEqual(body["status"], Status.HANDLED_MANUALLY)
        self.assertEqual(body["eta_method"], "")


@needs_starter_data
class HoldRaceTests(Actors, TestCase):
    """
    Simulate the race: the second request reads a stale view of the holds (as if
    it ranked before the first request's hold was committed), so it tries to
    hold the same units and the database refuses.
    """

    def test_conflict_rematches_and_holds_other_units(self):
        first = EmergencyRequest.objects.get(pk=self.raise_request(units_requested=1).json()["id"])
        first_units = set(first.holds.values_list("unit_id", flat=True))
        real = services.active_held_unit_ids
        calls = []

        def stale_then_real():
            calls.append(1)
            return set() if len(calls) == 1 else real()   # stale on the first attempt only

        with mock.patch("emergency.services.active_held_unit_ids", side_effect=stale_then_real):
            body = self.raise_request(units_requested=1).json()

        self.assertEqual(body["status"], Status.AWAITING_DECISION)
        second = EmergencyRequest.objects.get(pk=body["id"])
        second_units = set(second.holds.filter(released_at__isnull=True).values_list("unit_id", flat=True))
        self.assertTrue(second_units)
        self.assertFalse(first_units & second_units)
        self.assertEqual(AuditEvent.objects.filter(request=second, action="hold_conflict_retry").count(), 1)

    def test_persistent_conflict_hands_over_with_reason(self):
        self.raise_request(units_requested=1)
        with mock.patch("emergency.services.active_held_unit_ids", return_value=set()):
            body = self.raise_request(units_requested=1).json()

        self.assertEqual(body["status"], Status.HANDLED_MANUALLY)
        req = EmergencyRequest.objects.get(pk=body["id"])
        self.assertFalse(UnitHold.objects.filter(request=req).exists())
        self.assertEqual(AuditEvent.objects.filter(request=req, action="hold_conflict_retry").count(),
                         services.MAX_MATCH_ATTEMPTS)
        handover = AuditEvent.objects.filter(request=req, action="status_changed").last()
        self.assertEqual(handover.after["status"], Status.HANDLED_MANUALLY)
        self.assertIn("reserved by other requests", handover.reason)
