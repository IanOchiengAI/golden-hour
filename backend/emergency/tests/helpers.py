import unittest

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from accounts.models import Role, StaffProfile

starter_data_ready = settings.STARTER_DB_PATH.exists() and settings.STARTER_DB_PATH.stat().st_size > 0
needs_starter_data = unittest.skipUnless(
    starter_data_ready, "Run backend/scripts/build_starter_db.py to build the starter data"
)


def make_user(username, role, facility_id=""):
    user = get_user_model().objects.create_user(username=username, password="x-test-pass-123")
    StaffProfile.objects.create(user=user, role=role, facility_id=facility_id)
    return user


def client_for(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
    return c


class Actors:
    """Mixin: one user and API client per role."""

    def setUp(self):
        super().setUp()
        self.clinician = make_user("clin", Role.CLINICIAN, "HSP-002")
        self.officer = make_user("officer", Role.BLOOD_BANK_OFFICER, "RBTC-NBO")
        self.clin_api = client_for(self.clinician)
        self.officer_api = client_for(self.officer)

    def raise_request(self, **over):
        body = {"patient_blood_group": "O+", "component": "RBC", "units_requested": 2,
                "urgency": "life_threatening"}
        body.update(over)
        return self.clin_api.post("/requests", body, format="json")
