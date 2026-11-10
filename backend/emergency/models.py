from django.conf import settings
from django.db import models
from django.utils import timezone


class AuditEvent(models.Model):
    """
    Append-only record of every action: who, role, action, object, before, after,
    reason, time. Rows can be added but never edited or deleted through the app.
    """

    request = models.ForeignKey(
        "EmergencyRequest", null=True, blank=True, on_delete=models.PROTECT, related_name="audit_events"
    )
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    actor_username = models.CharField(max_length=150, blank=True)   # kept even if the user is removed
    actor_role = models.CharField(max_length=32, blank=True)         # "system" for automatic steps
    action = models.CharField(max_length=64)
    object_type = models.CharField(max_length=32, blank=True)
    object_id = models.CharField(max_length=200, blank=True)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise RuntimeError("AuditEvent rows are append-only")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("AuditEvent rows are append-only")

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M:%S} {self.actor_username or 'system'} {self.action}"


class Status(models.TextChoices):
    DRAFT_FROM_CALL = "DraftFromCall"
    RAISED = "Raised"
    MATCHING = "Matching"
    UNITS_HELD = "UnitsHeld"
    AWAITING_DECISION = "AwaitingDecision"
    ESCALATED = "Escalated"
    AWAITING_AUTHORISATION = "AwaitingAuthorisation"
    SENT_TO_SUPPLIER = "SentToSupplier"
    DISPATCHED = "Dispatched"
    IN_TRANSIT = "InTransit"
    RECEIVED = "Received"
    HANDLED_MANUALLY = "HandledManually"


class Urgency(models.TextChoices):
    LIFE_THREATENING = "life_threatening"
    URGENT = "urgent"
    ROUTINE = "routine"


class Component(models.TextChoices):
    RBC = "RBC", "Red cells"
    PLT = "PLT", "Platelets"
    FFP = "FFP", "Fresh frozen plasma"


class AuthorisationRoute(models.TextChoices):
    STANDING = "standing"          # MoH standing regional authorisation; MoH notified, can stop
    PER_TRANSFER = "per_transfer"  # MoH approves before dispatch


BLOOD_GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]
PATIENT_GROUP_CHOICES = [(g, g) for g in BLOOD_GROUPS] + [("unknown", "Unknown")]


class EmergencyRequest(models.Model):
    """A clinician's request for blood. Patient fields stay here and are never sent to suppliers or the model."""

    requesting_facility_id = models.CharField(max_length=16)
    raised_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    # Set by the client (e.g. a UUID from the offline outbox). Sending the same
    # id again returns this request instead of raising a second one.
    client_request_id = models.CharField(max_length=64, null=True, blank=True)
    patient_blood_group = models.CharField(max_length=8, choices=PATIENT_GROUP_CHOICES)
    component = models.CharField(max_length=4, choices=Component.choices)
    units_requested = models.PositiveSmallIntegerField()
    urgency = models.CharField(max_length=20, choices=Urgency.choices)
    clinical_note = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.RAISED)
    # Groups the rules engine allowed, and any warnings shown to the officer (e.g. unknown group).
    compatible_groups = models.JSONField(default=list)
    warnings = models.JSONField(default=list)
    # "model" or "fallback" — how the ETAs were produced. Drives the "AI offline" banner.
    eta_method = models.CharField(max_length=10, blank=True)
    # When the current status started; escalation timers measure from here.
    status_changed_at = models.DateTimeField(default=timezone.now)
    # Which authorisation tier applied, set when the officer accepts.
    authorisation_route = models.CharField(max_length=12, choices=AuthorisationRoute.choices, blank=True)
    # When a decision or authorisation timer fired.
    escalated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["raised_by", "client_request_id"], condition=models.Q(client_request_id__isnull=False),
                name="one_request_per_client_id_per_user",
            )
        ]

    def __str__(self):
        return f"#{self.pk} {self.component} {self.patient_blood_group} x{self.units_requested} ({self.status})"


class RankedOption(models.Model):
    """One supplying site offered to the blood bank officer, saved at matching time so GET is read-only."""

    request = models.ForeignKey(EmergencyRequest, on_delete=models.CASCADE, related_name="options")
    rank = models.PositiveSmallIntegerField()
    facility_id = models.CharField(max_length=16)
    facility_name = models.CharField(max_length=200)
    eta_low_min = models.FloatField()
    eta_mid_min = models.FloatField()
    eta_high_min = models.FloatField()
    method = models.CharField(max_length=10)          # model | fallback
    reason = models.TextField()
    warnings = models.JSONField(default=list)
    units_available = models.PositiveIntegerField()
    is_partial = models.BooleanField(default=False)   # site has fewer units than requested
    unit_ids = models.JSONField(default=list)         # units the rules engine would send, in pick order
    blood_groups = models.JSONField(default=list)     # groups of those units

    class Meta:
        ordering = ["request", "rank"]
        constraints = [models.UniqueConstraint(fields=["request", "rank"], name="uniq_option_rank")]


class UnitHold(models.Model):
    """
    A unit reserved for a request. Active while released_at is empty.
    A unit can only have one active hold at a time (enforced by the database).
    """

    request = models.ForeignKey(EmergencyRequest, on_delete=models.CASCADE, related_name="holds")
    option = models.ForeignKey(RankedOption, on_delete=models.CASCADE, related_name="holds")
    unit_id = models.CharField(max_length=40)
    facility_id = models.CharField(max_length=16)
    held_at = models.DateTimeField(auto_now_add=True)
    released_at = models.DateTimeField(null=True, blank=True)
    release_reason = models.CharField(max_length=200, blank=True)
    # Set when the units leave the supplying site. A consumed hold is never
    # released: the starter data is read-only and still lists the unit as
    # in_stock, so the active hold is what keeps it out of future matching.
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["unit_id"], condition=models.Q(released_at__isnull=True), name="one_active_hold_per_unit"
            )
        ]


class DispatchStatus(models.TextChoices):
    AWAITING_RELEASE = "AwaitingRelease"
    RELEASED = "Released"
    DECLINED = "Declined"
    CANCELLED = "Cancelled"
    IN_TRANSIT = "InTransit"
    RECEIVED = "Received"


class TransportMode(models.TextChoices):
    VEHICLE = "vehicle"
    MOTORBIKE = "motorbike"
    PUBLIC_SERVICE_VEHICLE = "public_service_vehicle"


OPEN_DISPATCH_STATUSES = [DispatchStatus.AWAITING_RELEASE, DispatchStatus.RELEASED, DispatchStatus.IN_TRANSIT]


class Dispatch(models.Model):
    """
    One movement of units from a supplying site to the requesting hospital.
    The supplying lab sees this, never the patient fields on the request.
    """

    request = models.ForeignKey(EmergencyRequest, on_delete=models.PROTECT, related_name="dispatches")
    option = models.ForeignKey(RankedOption, on_delete=models.PROTECT, related_name="dispatches")
    from_facility_id = models.CharField(max_length=16)
    to_facility_id = models.CharField(max_length=16)
    unit_ids = models.JSONField(default=list)
    status = models.CharField(max_length=20, choices=DispatchStatus.choices, default=DispatchStatus.AWAITING_RELEASE)
    transport_mode = models.CharField(max_length=24, choices=TransportMode.choices, blank=True)
    released_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.PROTECT, related_name="+")
    released_at = models.DateTimeField(null=True, blank=True)
    decline_reason = models.CharField(max_length=500, blank=True)
    in_transit_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.PROTECT, related_name="+")
    received_at = models.DateTimeField(null=True, blank=True)
    coolbox_max_temp_c = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # A request has at most one dispatch in progress at a time.
            models.UniqueConstraint(
                fields=["request"], condition=models.Q(status__in=OPEN_DISPATCH_STATUSES),
                name="one_open_dispatch_per_request",
            )
        ]

    def __str__(self):
        return f"Dispatch {self.pk} {self.from_facility_id}→{self.to_facility_id} ({self.status})"
