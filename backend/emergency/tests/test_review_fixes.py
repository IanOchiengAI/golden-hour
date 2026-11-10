"""
Fixes from Daniel's backend review (GitHub issue #3): hold expiry, rate limit and
open-request cap, idempotent POST /requests, CORS, token expiry.
"""

from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from emergency.country import get_config
from emergency.models import AuditEvent, EmergencyRequest, Status, UnitHold

from .helpers import Actors, needs_starter_data

BODY = {"patient_blood_group": "O+", "component": "RBC", "units_requested": 1, "urgency": "urgent"}


def age(req_id, minutes):
    """Pretend the request has been waiting in its current status for `minutes`."""
    EmergencyRequest.objects.filter(pk=req_id).update(status_changed_at=timezone.now() - timedelta(minutes=minutes))


def active(req_id):
    return UnitHold.objects.filter(request_id=req_id, released_at__isnull=True).count()


@needs_starter_data
class HoldExpiryTests(Actors, TestCase):
    def test_stale_hold_is_released_when_next_request_arrives(self):
        old = self.raise_request(**BODY).json()["id"]
        age(old, get_config()["hold_ttl_min"] + 1)
        self.raise_request(**BODY)
        req = EmergencyRequest.objects.get(pk=old)
        self.assertEqual(req.status, Status.HANDLED_MANUALLY)
        self.assertEqual(active(old), 0)
        self.assertTrue(AuditEvent.objects.filter(request=req, action="hold_expired").exists())

    def test_fresh_hold_is_kept(self):
        rid = self.raise_request(**BODY).json()["id"]
        age(rid, get_config()["hold_ttl_min"] - 1)
        self.raise_request(**BODY)
        self.assertEqual(EmergencyRequest.objects.get(pk=rid).status, Status.AWAITING_DECISION)
        self.assertEqual(active(rid), 1)

    def test_expired_request_cannot_be_accepted(self):
        rid = self.raise_request(**BODY).json()["id"]
        age(rid, get_config()["hold_ttl_min"] + 1)
        self.assertEqual(self.decide(rid, action="accept").status_code, 409)
        # The 409 must not roll the expiry back.
        self.assertEqual(EmergencyRequest.objects.get(pk=rid).status, Status.HANDLED_MANUALLY)
        self.assertEqual(active(rid), 0)

    def test_awaiting_authorisation_also_expires(self):
        rid = self.raise_request(**BODY).json()["id"]
        self.decide(rid, action="accept")                      # urgent → AwaitingAuthorisation
        age(rid, get_config()["hold_ttl_min"] + 1)
        self.assertEqual(self.authorise(rid, action="approve").status_code, 409)
        self.assertEqual(active(rid), 0)

    def test_dispatched_units_never_expire(self):
        rid = self.raise_request(**{**BODY, "urgency": "life_threatening"}).json()["id"]
        d = self.decide(rid, action="accept").json()["dispatch"]
        self.lab_api(d["from_facility_id"]).post(f"/dispatches/{d['id']}/release", {"action": "confirm"},
                                                 format="json")
        age(rid, 10_000)
        call_command("expire_holds", stdout=StringIO())
        self.assertEqual(EmergencyRequest.objects.get(pk=rid).status, Status.DISPATCHED)
        self.assertEqual(active(rid), 1)   # consumed hold stays active forever

    def test_command(self):
        rid = self.raise_request(**BODY).json()["id"]
        age(rid, get_config()["hold_ttl_min"] + 1)
        out = StringIO()
        call_command("expire_holds", stdout=out)
        self.assertIn(str(rid), out.getvalue())


@needs_starter_data
class HoardingLimitTests(Actors, TestCase):
    def test_raise_request_is_rate_limited_per_user(self):
        bad = {"component": "RBC"}   # invalid body: fast, but still counts towards the limit
        with mock.patch.dict(ScopedRateThrottle.THROTTLE_RATES, {"raise_request": "2/min"}):
            codes = [self.clin_api.post("/requests", bad, format="json").status_code for _ in range(3)]
            self.assertEqual(codes, [400, 400, 429])
            self.assertEqual(self.officer_api.get("/requests").status_code, 200)   # GET not limited

    def test_open_requests_capped_per_facility(self):
        cfg = {**get_config(), "max_open_requests_per_facility": 1}
        with mock.patch("emergency.views.get_config", return_value=cfg):
            first = self.raise_request(**BODY)
            self.assertEqual(first.status_code, 201)
            self.assertEqual(self.raise_request(**BODY).status_code, 429)
            self.decide(first.json()["id"], action="reject", reason="duplicate")   # closes it
            self.assertEqual(self.raise_request(**BODY).status_code, 201)
        self.assertTrue(AuditEvent.objects.filter(action="request_refused_cap").exists())


@needs_starter_data
class IdempotencyTests(Actors, TestCase):
    CID = "3f2b8c1e-5d4a-4e7b-9a10-2c6d8e9f0a1b"

    def test_retry_returns_same_request_and_one_hold(self):
        first = self.raise_request(**BODY, client_request_id=self.CID)
        again = self.raise_request(**BODY, client_request_id=self.CID)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(first.json()["id"], again.json()["id"])
        self.assertEqual(again.json()["client_request_id"], self.CID)
        self.assertEqual(EmergencyRequest.objects.count(), 1)
        self.assertEqual(UnitHold.objects.count(), 1)

    def test_same_id_different_details_is_409(self):
        self.raise_request(**BODY, client_request_id=self.CID)
        r = self.raise_request(**{**BODY, "units_requested": 2}, client_request_id=self.CID)
        self.assertEqual(r.status_code, 409)

    def test_ids_are_per_user(self):
        from accounts.models import Role
        from .helpers import client_for, make_user
        other = client_for(make_user("clin2", Role.CLINICIAN, "HSP-002"))
        a = self.raise_request(**BODY, client_request_id=self.CID).json()["id"]
        b = other.post("/requests", {**BODY, "client_request_id": self.CID}, format="json").json()["id"]
        self.assertNotEqual(a, b)

    def test_without_id_each_post_is_new(self):
        self.raise_request(**BODY)
        self.raise_request(**BODY)
        self.assertEqual(EmergencyRequest.objects.count(), 2)

    def test_bad_id_is_400(self):
        self.assertEqual(self.raise_request(**BODY, client_request_id="x").status_code, 400)
        self.assertEqual(self.raise_request(**BODY, client_request_id="has spaces in it").status_code, 400)


class CorsTests(TestCase):
    def test_vite_dev_server_allowed(self):
        r = APIClient().options("/requests", HTTP_ORIGIN="http://localhost:5173",
                                HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
                                HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,content-type")
        self.assertEqual(r["Access-Control-Allow-Origin"], "http://localhost:5173")
        self.assertIn("authorization", r["Access-Control-Allow-Headers"].lower())

    def test_other_origin_not_allowed(self):
        r = APIClient().options("/requests", HTTP_ORIGIN="https://evil.example",
                                HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST")
        self.assertNotIn("Access-Control-Allow-Origin", r)


class TokenExpiryTests(Actors, TestCase):
    def test_old_token_is_refused_and_deleted(self):
        Token.objects.filter(user=self.officer).update(created=timezone.now() - timedelta(hours=13))
        r = self.officer_api.get("/requests")
        self.assertEqual(r.status_code, 401)
        self.assertIn("expired", r.json()["detail"])
        self.assertFalse(Token.objects.filter(user=self.officer).exists())
        self.assertTrue(AuditEvent.objects.filter(action="token_expired", actor_username="officer").exists())

    def test_login_replaces_expired_token(self):
        old = Token.objects.get(user=self.officer)
        Token.objects.filter(pk=old.pk).update(created=timezone.now() - timedelta(hours=13))
        r = APIClient().post("/auth/login", {"username": "officer", "password": "x-test-pass-123"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertNotEqual(r.json()["token"], old.key)
        self.assertIn("expires_at", r.json())

    def test_fresh_token_works(self):
        self.assertEqual(self.officer_api.get("/requests").status_code, 200)
