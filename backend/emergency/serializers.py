from rest_framework import serializers

from .country import get_config
from .models import Component, EmergencyRequest, PATIENT_GROUP_CHOICES, RankedOption, Urgency
from .rules import CompatibilityError, compatible_donor_groups


class CreateRequestSerializer(serializers.Serializer):
    """Clinician input. The requesting facility comes from the clinician's profile, not the body."""

    patient_blood_group = serializers.ChoiceField(choices=PATIENT_GROUP_CHOICES)
    component = serializers.ChoiceField(choices=Component.choices)
    units_requested = serializers.IntegerField(min_value=1)
    urgency = serializers.ChoiceField(choices=Urgency.choices)
    clinical_note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")

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
            "id", "requesting_facility_id", "patient_blood_group", "component", "units_requested",
            "urgency", "clinical_note", "status", "compatible_groups", "warnings", "eta_method",
            "created_at", "updated_at",
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
