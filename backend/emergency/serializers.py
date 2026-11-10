from rest_framework import serializers

from .country import get_config
from .models import (
    AuditEvent, Component, Dispatch, EmergencyRequest, PATIENT_GROUP_CHOICES, RankedOption, TransportMode, Urgency,
)
from .rules import CompatibilityError, compatible_donor_groups


class CreateRequestSerializer(serializers.Serializer):
    """Clinician input. The requesting facility comes from the clinician's profile, not the body."""

    patient_blood_group = serializers.ChoiceField(choices=PATIENT_GROUP_CHOICES)
    component = serializers.ChoiceField(choices=Component.choices)
    units_requested = serializers.IntegerField(min_value=1)
    urgency = serializers.ChoiceField(choices=Urgency.choices)
    clinical_note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    # Optional idempotency key, e.g. a UUID the offline outbox generates once per request.
    client_request_id = serializers.RegexField(
        r"^[A-Za-z0-9._:-]{8,64}$", required=False, allow_null=True, default=None,
        error_messages={"invalid": "Use 8–64 letters, digits, '.', '_', ':' or '-' (a UUID works)."},
    )

    def validate_units_requested(self, value):
        limit = int(get_config().get("max_units_per_request", 10))
        if value > limit:
            raise serializers.ValidationError(f"At most {limit} units per request.")
        return value

    def validate(self, attrs):
        try:
            compatible_donor_groups(attrs["patient_blood_group"], attrs["component"])
        except CompatibilityError as e:
            raise serializers.ValidationError({"patient_blood_group": str(e)})
        return attrs


class RequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyRequest
        fields = [
            "id", "client_request_id", "requesting_facility_id", "patient_blood_group", "component",
            "units_requested", "urgency", "clinical_note", "status", "compatible_groups", "warnings",
            "eta_method", "created_at", "updated_at",
        ]


class OptionSerializer(serializers.ModelSerializer):
    eta = serializers.SerializerMethodField()
    is_held = serializers.SerializerMethodField()

    class Meta:
        model = RankedOption
        fields = [
            "id", "rank", "facility_id", "facility_name", "eta", "method", "reason", "warnings",
            "units_available", "is_partial", "unit_ids", "blood_groups", "is_held",
        ]

    def get_eta(self, o):
        return {"low_min": o.eta_low_min, "mid_min": o.eta_mid_min, "high_min": o.eta_high_min}

    def get_is_held(self, o):
        return o.id in self.context.get("held_option_ids", set())


# ── Workflow inputs ──────────────────────────────────────────────────────
def _require_reason(attrs, actions):
    if attrs["action"] in actions and len(attrs.get("reason", "").strip()) < 3:
        raise serializers.ValidationError({"reason": f"A reason is required for '{attrs['action']}'."})


class DecisionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["accept", "change", "reject"])
    option_id = serializers.IntegerField(required=False, min_value=1)
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["action"] == "change" and not attrs.get("option_id"):
            raise serializers.ValidationError({"option_id": "Choose the option to change to."})
        _require_reason(attrs, ("change", "reject"))
        return attrs


class AuthoriseSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["approve", "reject", "stop", "review"])
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        _require_reason(attrs, ("reject", "stop"))
        return attrs


# ── Dispatch: what the supplying lab sees ────────────────────────────────
# Rule: supplying facilities never see patient details. Only the fields listed
# here are sent; nothing from the request's patient fields, note or warnings.
SUPPLIER_SAFE_DISPATCH_FIELDS = [
    "id", "request_id", "status", "from_facility_id", "to_facility_id", "to_facility_name",
    "component", "units_requested", "unit_ids", "blood_groups", "urgency", "transport_mode",
    "created_at", "released_at", "in_transit_at", "received_at", "coolbox_max_temp_c",
]


class DispatchSerializer(serializers.ModelSerializer):
    request_id = serializers.IntegerField(source="request.id", read_only=True)
    component = serializers.CharField(source="request.component", read_only=True)
    units_requested = serializers.IntegerField(source="request.units_requested", read_only=True)
    urgency = serializers.CharField(source="request.urgency", read_only=True)
    to_facility_name = serializers.SerializerMethodField()
    blood_groups = serializers.SerializerMethodField()

    class Meta:
        model = Dispatch
        fields = SUPPLIER_SAFE_DISPATCH_FIELDS

    def get_to_facility_name(self, d):
        names = self.context.get("facility_names")
        if names is not None:   # lists pass the names in, so the starter DB is read once
            return names.get(d.to_facility_id, d.to_facility_id)
        from . import stock
        try:
            f = stock.get_facility(d.to_facility_id)
        except stock.StarterDataUnavailable:
            f = None
        return f["name"] if f else d.to_facility_id

    def get_blood_groups(self, d):
        # Groups of the units being sent (unit labels, not the patient's group).
        by_unit = dict(zip(d.option.unit_ids, d.option.blood_groups))
        return [by_unit.get(u) for u in d.unit_ids]


class RequestDetailSerializer(RequestSerializer):
    """Request + its held option + its current dispatch. Returned by workflow actions."""

    held_option_id = serializers.SerializerMethodField()
    authorisation_route = serializers.CharField(read_only=True)
    status_changed_at = serializers.DateTimeField(read_only=True)
    dispatch = serializers.SerializerMethodField()

    class Meta(RequestSerializer.Meta):
        fields = RequestSerializer.Meta.fields + [
            "held_option_id", "authorisation_route", "status_changed_at", "dispatch",
        ]

    def get_held_option_id(self, r):
        hold = r.holds.filter(released_at__isnull=True).first()
        return hold.option_id if hold else None

    def get_dispatch(self, r):
        d = r.dispatches.order_by("-created_at", "-id").first()
        return DispatchSerializer(d).data if d else None


class ReleaseSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["confirm", "decline"])
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    transport_mode = serializers.ChoiceField(choices=TransportMode.choices, required=False, allow_blank=True,
                                             default="")

    def validate(self, attrs):
        _require_reason(attrs, ("decline",))
        return attrs


class DispatchStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["in_transit", "received"])
    coolbox_max_temp_c = serializers.FloatField(required=False, allow_null=True, default=None,
                                                min_value=-30, max_value=60)


class AuditEventSerializer(serializers.ModelSerializer):
    time = serializers.DateTimeField(source="created_at")
    actor = serializers.SerializerMethodField()
    role = serializers.CharField(source="actor_role")
    object = serializers.SerializerMethodField()

    class Meta:
        model = AuditEvent
        fields = ["id", "time", "actor", "role", "action", "object", "before", "after", "reason"]

    def get_actor(self, e):
        return e.actor_username or "system"

    def get_object(self, e):
        return f"{e.object_type}:{e.object_id}" if e.object_type else ""


class RequestSummarySerializer(RequestSerializer):
    """
    One row in a work queue (GET /requests). Uses prefetched holds and dispatches,
    so a list costs a fixed number of queries.
    """

    held_option = serializers.SerializerMethodField()
    due_at = serializers.SerializerMethodField()
    dispatch_id = serializers.SerializerMethodField()
    dispatch_status = serializers.SerializerMethodField()
    authorisation_route = serializers.CharField(read_only=True)
    status_changed_at = serializers.DateTimeField(read_only=True)

    class Meta(RequestSerializer.Meta):
        fields = RequestSerializer.Meta.fields + [
            "authorisation_route", "status_changed_at", "due_at", "held_option", "dispatch_id", "dispatch_status",
        ]

    def get_held_option(self, r):
        hold = next((h for h in r.holds.all() if h.released_at is None), None)
        if not hold:
            return None
        o = hold.option
        return {"id": o.id, "rank": o.rank, "facility_id": o.facility_id, "facility_name": o.facility_name,
                "eta": {"low_min": o.eta_low_min, "mid_min": o.eta_mid_min, "high_min": o.eta_high_min},
                "is_partial": o.is_partial}

    def get_due_at(self, r):
        """When the officer (AwaitingDecision) or MoH (AwaitingAuthorisation) should have acted by."""
        from datetime import timedelta

        from .country import get_config
        from .models import Status
        key = {Status.AWAITING_DECISION: "decision_escalation_min",
               Status.AWAITING_AUTHORISATION: "authorisation_escalation_min"}.get(r.status)
        if not key:
            return None
        return (r.status_changed_at + timedelta(minutes=int(get_config().get(key, 5)))).isoformat()

    def _latest_dispatch(self, r):
        return max(r.dispatches.all(), key=lambda d: (d.created_at, d.id), default=None)

    def get_dispatch_id(self, r):
        d = self._latest_dispatch(r)
        return d.id if d else None

    def get_dispatch_status(self, r):
        d = self._latest_dispatch(r)
        return d.status if d else None
