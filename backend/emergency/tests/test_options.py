from unittest import mock

from django.test import TestCase

from emergency.models import AuditEvent, RankedOption, UnitHold

from .helpers import Actors, model_offline, needs_starter_data


@needs_starter_data
class OptionsTests(Actors, TestCase):
    def setUp(self):
        super().setUp()
        self.req_id = self.raise_request().json()["id"]

    def get(self, api=None, req_id=None):
        return (api or self.officer_api).get(f"/requests/{req_id or self.req_id}/options")

    def test_officer_sees_ranked_options_with_range_reason_and_hold(self):
        r = self.get()
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["request"]["id"], self.req_id)
        self.assertIn(body["method"], ("model", "fallback"))
        self.assertEqual(body["ai_offline"], body["method"] == "fallback")
        self.assertEqual(body["data_as_of"], "2026-10-31")

        opts = body["options"]
        self.assertEqual([o["rank"] for o in opts], list(range(1, len(opts) + 1)))
        for o in opts:
            eta = o["eta"]
            self.assertLessEqual(eta["low_min"], eta["mid_min"])
            self.assertLessEqual(eta["mid_min"], eta["high_min"])
            self.assertTrue(o["reason"])
        self.assertTrue(opts[0]["is_held"])
        self.assertFalse(any(o["is_held"] for o in opts[1:]))
        self.assertEqual(body["held_option_id"], opts[0]["id"])

    def test_get_is_read_only(self):
        counts = lambda: (RankedOption.objects.count(), UnitHold.objects.count(), AuditEvent.objects.count())
        before = counts()
        with mock.patch("emergency.matching.match") as match:
            self.get()
            self.get()
        match.assert_not_called()
        self.assertEqual(counts(), before)

    def test_fallback_flag_shown(self):
        with model_offline():
            req_id = self.raise_request().json()["id"]
        body = self.get(req_id=req_id).json()
        self.assertTrue(body["ai_offline"])
        self.assertTrue(all(o["method"] == "fallback" for o in body["options"]))

    def test_clinician_cannot_read_options(self):
        self.assertEqual(self.get(api=self.clin_api).status_code, 403)

    def test_missing_request_is_404(self):
        self.assertEqual(self.get(req_id=999999).status_code, 404)
