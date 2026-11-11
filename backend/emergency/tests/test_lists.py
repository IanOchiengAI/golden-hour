from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts.models import Role
from emergency.models import Status

from .helpers import Actors, client_for, make_user, needs_starter_data

PATIENT_FIELDS = {"patient_blood_group", "clinical_note", "warnings", "compatible_groups"}


@needs_starter_data
class RequestListTests(Actors, TestCase):
    def setUp(self):
        super().setUp()
        self.other_clin = client_for(make_user("clin-ksm", Role.CLINICIAN, "HSP-012"))
        self.mine = self.raise_request(urgency="urgent").json()["id"]
        self.theirs = self.other_clin.post("/requests", {"patient_blood_group": "A+", "component": "RBC",
                                                         "units_requested": 1, "urgency": "routine"},
                                           format="json").json()["id"]

    def ids(self, api, query=""):
        r = api.get(f"/requests{query}")
        self.assertEqual(r.status_code, 200, r.content)
        return [row["id"] for row in r.json()["results"]]

    def test_clinician_sees_only_own_hospital(self):
        self.assertEqual(self.ids(self.clin_api), [self.mine])
        self.assertEqual(self.clin_api.get(f"/requests/{self.theirs}").status_code, 404)

    def test_officer_and_moh_see_all_newest_first(self):
        self.assertEqual(self.ids(self.officer_api), [self.theirs, self.mine])
        self.assertEqual(self.ids(self.moh_api), [self.theirs, self.mine])

    def test_lab_cannot_list_requests(self):
        self.assertEqual(self.lab_api("RBTC-NBO").get("/requests").status_code, 403)
        self.assertEqual(self.lab_api("RBTC-NBO").get(f"/requests/{self.mine}").status_code, 403)

    def test_filters(self):
        self.decide(self.mine, action="accept")                       # urgent → AwaitingAuthorisation
        self.assertEqual(self.ids(self.moh_api, "?status=AwaitingAuthorisation"), [self.mine])
        self.assertEqual(self.ids(self.officer_api, "?status=AwaitingDecision&status=Escalated"), [self.theirs])
        self.assertEqual(set(self.ids(self.officer_api, "?status=AwaitingDecision,AwaitingAuthorisation")),
                         {self.mine, self.theirs})
        self.assertEqual(self.ids(self.officer_api, "?urgency=routine"), [self.theirs])
        self.assertEqual(self.ids(self.officer_api, "?limit=1"), [self.theirs])

    def test_bad_filters_are_400(self):
        for q in ("?status=Lost", "?urgency=whenever", "?limit=0", "?limit=500", "?limit=x"):
            self.assertEqual(self.officer_api.get(f"/requests{q}").status_code, 400, q)

    def test_summary_row(self):
        row = next(r for r in self.officer_api.get("/requests").json()["results"] if r["id"] == self.mine)
        self.assertEqual(row["status"], Status.AWAITING_DECISION)
        self.assertEqual(row["held_option"]["rank"], 1)
        self.assertLessEqual(row["held_option"]["eta"]["low_min"], row["held_option"]["eta"]["high_min"])
        self.assertIsNotNone(row["due_at"])
        self.assertIsNone(row["dispatch_id"])

        self.decide(self.mine, action="accept")
        self.authorise(self.mine, action="approve")
        row = next(r for r in self.officer_api.get("/requests").json()["results"] if r["id"] == self.mine)
        self.assertEqual(row["status"], Status.SENT_TO_SUPPLIER)
        self.assertIsNone(row["due_at"])
        self.assertEqual(row["dispatch_status"], "AwaitingRelease")

    def test_list_query_count_does_not_grow_with_rows(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.officer_api.get("/requests")
            return len(ctx.captured_queries)
        before = count()
        self.raise_request()
        self.raise_request()
        self.assertEqual(count(), before)

    def test_detail_has_options_and_hold(self):
        body = self.clin_api.get(f"/requests/{self.mine}").json()
        self.assertEqual(body["id"], self.mine)
        self.assertTrue(body["options"])
        held = [o for o in body["options"] if o["is_held"]]
        self.assertEqual([o["id"] for o in held], [body["held_option_id"]])
        self.assertIsNone(body["dispatch"])


@needs_starter_data
class DispatchListTests(Actors, TestCase):
    def setUp(self):
        super().setUp()
        rid = self.raise_request(urgency="life_threatening").json()["id"]
        self.dispatch = self.decide(rid, action="accept").json()["dispatch"]
        self.site = self.dispatch["from_facility_id"]

    def test_supplying_lab_sees_its_dispatch_without_patient_fields(self):
        r = self.lab_api(self.site).get("/dispatches")
        self.assertEqual(r.status_code, 200, r.content)
        rows = r.json()["results"]
        self.assertEqual([d["id"] for d in rows], [self.dispatch["id"]])
        self.assertFalse(PATIENT_FIELDS & set(rows[0]))
        self.assertNotEqual(rows[0]["to_facility_name"], rows[0]["to_facility_id"])   # name resolved
        detail = self.lab_api(self.site).get(f"/dispatches/{self.dispatch['id']}").json()
        self.assertFalse(PATIENT_FIELDS & set(detail))

    def test_other_lab_sees_nothing(self):
        other = "RBTC-MSA" if self.site != "RBTC-MSA" else "RBTC-KSM"
        self.assertEqual(self.lab_api(other).get("/dispatches").json()["results"], [])
        self.assertEqual(self.lab_api(other).get(f"/dispatches/{self.dispatch['id']}").status_code, 404)

    def test_requesting_clinician_sees_incoming(self):
        rows = self.clin_api.get("/dispatches").json()["results"]
        self.assertEqual([d["id"] for d in rows], [self.dispatch["id"]])

    def test_status_filter(self):
        lab = self.lab_api(self.site)
        self.assertEqual(len(lab.get("/dispatches?status=AwaitingRelease").json()["results"]), 1)
        self.assertEqual(lab.get("/dispatches?status=Received").json()["results"], [])
        self.assertEqual(lab.get("/dispatches?status=Nope").status_code, 400)

    def test_officer_and_moh_cannot_list_dispatches(self):
        self.assertEqual(self.officer_api.get("/dispatches").status_code, 403)
        self.assertEqual(self.moh_api.get("/dispatches").status_code, 403)
