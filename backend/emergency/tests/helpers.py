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
        self.moh = make_user("moh", Role.MOH_OFFICER)
        self.clin_api = client_for(self.clinician)
        self.officer_api = client_for(self.officer)
        self.moh_api = client_for(self.moh)
        self._lab_apis = {}

    def lab_api(self, facility_id):
        """API client for a lab officer at the given supplying facility."""
        if facility_id not in self._lab_apis:
            user = make_user(f"lab-{facility_id}", Role.LAB_OFFICER, facility_id)
            self._lab_apis[facility_id] = client_for(user)
        return self._lab_apis[facility_id]

    def decide(self, req_id, **body):
        return self.officer_api.post(f"/requests/{req_id}/decision", body, format="json")

    def authorise(self, req_id, **body):
        return self.moh_api.post(f"/requests/{req_id}/authorise", body, format="json")

    def raise_request(self, **over):
        body = {"patient_blood_group": "O+", "component": "RBC", "units_requested": 2,
                "urgency": "life_threatening"}
        body.update(over)
        return self.clin_api.post("/requests", body, format="json")
