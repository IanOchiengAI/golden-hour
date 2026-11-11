from django.test import TestCase
from django.utils import timezone

from emergency import services
from emergency.exceptions import exception_handler
from emergency.models import AuditEvent, EmergencyRequest, Status, UnitHold

from .helpers import Actors, needs_starter_data


@needs_starter_data
class SharedServiceTests(Actors, TestCase):
    def setUp(self):
        super().setUp()
        self.req = EmergencyRequest.objects.get(pk=self.raise_request().json()["id"])

    def test_release_holds_frees_units_and_audits(self):
        held = set(self.req.holds.values_list("unit_id", flat=True))
        released = services.release_holds(self.req, reason="test release", actor=self.officer)
        self.assertEqual(set(released), held)
        self.assertFalse(UnitHold.objects.filter(request=self.req, released_at__isnull=True).exists())
        self.assertEqual(services.active_held_unit_ids() & held, set())
        event = AuditEvent.objects.filter(request=self.req, action="holds_released").get()
        self.assertEqual(event.actor_username, "officer")

    def test_consumed_holds_are_never_released(self):
        self.req.holds.update(consumed_at=timezone.now())
        self.assertEqual(services.release_holds(self.req, reason="should not release"), [])
        held = set(self.req.holds.values_list("unit_id", flat=True))
        self.assertTrue(held <= services.active_held_unit_ids())

    def test_transition_records_when_status_started(self):
        before = self.req.status_changed_at
        services.transition(self.req, Status.HANDLED_MANUALLY, reason="test")
        self.req.refresh_from_db()
        self.assertGreater(self.req.status_changed_at, before)

    def test_invalid_transition_maps_to_409(self):
        with self.assertRaises(services.InvalidTransition) as ctx:
            services.transition(self.req, Status.RECEIVED)
        response = exception_handler(ctx.exception, {})
        self.assertEqual(response.status_code, 409)
        self.assertIn("AwaitingDecision", response.data["detail"])
