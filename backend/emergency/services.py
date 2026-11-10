"""
Request workflow. Every status change goes through transition(), which refuses
moves the lifecycle does not allow and writes an AuditEvent.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone

from . import matching
from .audit import record
from .models import EmergencyRequest, RankedOption, Status, UnitHold

S = Status
ALLOWED_TRANSITIONS = {
    S.DRAFT_FROM_CALL: {S.RAISED},
    S.RAISED: {S.MATCHING},
    S.MATCHING: {S.UNITS_HELD, S.HANDLED_MANUALLY},
    S.UNITS_HELD: {S.AWAITING_DECISION},
    S.AWAITING_DECISION: {S.ESCALATED, S.UNITS_HELD, S.AWAITING_AUTHORISATION, S.SENT_TO_SUPPLIER, S.HANDLED_MANUALLY},
    S.ESCALATED: {S.UNITS_HELD, S.AWAITING_AUTHORISATION, S.SENT_TO_SUPPLIER, S.HANDLED_MANUALLY},
    S.AWAITING_AUTHORISATION: {S.SENT_TO_SUPPLIER, S.HANDLED_MANUALLY},
    S.SENT_TO_SUPPLIER: {S.DISPATCHED, S.UNITS_HELD, S.HANDLED_MANUALLY},
    S.DISPATCHED: {S.IN_TRANSIT},
    S.IN_TRANSIT: {S.RECEIVED},
    S.RECEIVED: set(),
    S.HANDLED_MANUALLY: set(),
}


class InvalidTransition(Exception):
    """A move the lifecycle does not allow. The API returns it as 409 Conflict."""


def transition(req: EmergencyRequest, new_status: str, *, actor=None, reason="", details=None):
    old = req.status
    if new_status not in ALLOWED_TRANSITIONS[old]:
        raise InvalidTransition(f"Cannot move request {req.pk} from {old} to {new_status}")
    req.status = new_status
    req.status_changed_at = timezone.now()
    req.save(update_fields=["status", "status_changed_at", "updated_at"])
    record(
        action="status_changed", actor=actor, request=req, object_type="request", object_id=req.pk,
        before={"status": old}, after={"status": new_status, **(details or {})}, reason=reason,
    )


def active_held_unit_ids() -> set[str]:
    return set(UnitHold.objects.filter(released_at__isnull=True).values_list("unit_id", flat=True))


def hold_option(req: EmergencyRequest, option: RankedOption, *, actor=None, reason=""):
    """Reserve the option's units. The DB refuses a unit already held elsewhere (IntegrityError)."""
    holds = UnitHold.objects.bulk_create([
        UnitHold(request=req, option=option, unit_id=uid, facility_id=option.facility_id)
        for uid in option.unit_ids
    ])
    record(
        action="units_held", actor=actor, request=req, object_type="option", object_id=option.pk,
        after={"facility_id": option.facility_id, "rank": option.rank, "unit_ids": option.unit_ids,
               "is_partial": option.is_partial},
        reason=reason,
    )
    return holds


def release_holds(req: EmergencyRequest, *, reason: str, actor=None) -> list[str]:
    """
    Release the request's active holds so the units can be offered again.
    Consumed holds (units already dispatched) are never released.
    Returns the released unit ids.
    """
    holds = req.holds.filter(released_at__isnull=True, consumed_at__isnull=True)
    unit_ids = list(holds.values_list("unit_id", flat=True))
    if not unit_ids:
        return []
    holds.update(released_at=timezone.now(), release_reason=reason[:200])
    record(
        action="holds_released", actor=actor, request=req, object_type="request", object_id=req.pk,
        before={"unit_ids": unit_ids}, after={"unit_ids": []}, reason=reason,
    )
    return unit_ids


MAX_MATCH_ATTEMPTS = 3


@transaction.atomic   # any failure (e.g. starter data missing) leaves no half-made request
def create_request(*, user, requesting_facility_id, patient_blood_group, component,
                   units_requested, urgency, clinical_note="") -> EmergencyRequest:
    """
    Raise a request, match it and auto-hold the top site's units, in one step.
    Raised → Matching → UnitsHeld → AwaitingDecision, or Matching → HandledManually
    when no safe compatible stock exists.
    """
    req = EmergencyRequest.objects.create(
        requesting_facility_id=requesting_facility_id, raised_by=user,
        patient_blood_group=patient_blood_group, component=component,
        units_requested=units_requested, urgency=urgency, clinical_note=clinical_note,
        status=S.RAISED,
    )
    record(
        action="request_raised", actor=user, request=req, object_type="request", object_id=req.pk,
        after={"facility_id": requesting_facility_id, "patient_blood_group": patient_blood_group,
               "component": component, "units_requested": units_requested, "urgency": urgency},
    )
    transition(req, S.MATCHING)

    # Another request may grab the same unit between matching and holding; the
    # database constraint catches that and we match again without those units.
    for attempt in range(1, MAX_MATCH_ATTEMPTS + 1):
        try:
            with transaction.atomic():
                _match_and_hold(req)
            return req
        except IntegrityError:
            if attempt == MAX_MATCH_ATTEMPTS:
                raise
    return req


def _match_and_hold(req: EmergencyRequest):
    result = matching.match(
        requesting_facility_id=req.requesting_facility_id,
        patient_blood_group=req.patient_blood_group,
        component=req.component,
        units_requested=req.units_requested,
        held_unit_ids=active_held_unit_ids(),
    )
    req.compatible_groups = result.compatible_groups
    req.warnings = result.warnings
    req.eta_method = result.method
    req.save(update_fields=["compatible_groups", "warnings", "eta_method", "updated_at"])

    options = [RankedOption.objects.create(request=req, **o) for o in result.options]
    record(
        action="matching_completed", request=req, object_type="request", object_id=req.pk,
        after={
            "compatible_groups": result.compatible_groups,
            "units_excluded_by_rule": result.excluded,
            "sites_with_safe_stock": result.sites_considered,
            "options": [{"rank": o.rank, "facility_id": o.facility_id, "eta_mid_min": o.eta_mid_min,
                         "is_partial": o.is_partial} for o in options],
            "eta_method": result.method,
        },
    )

    if not options:
        transition(req, S.HANDLED_MANUALLY, reason="No safe, compatible stock found in the network")
        return

    hold_option(req, options[0], reason="Auto-hold at top-ranked site")
    transition(req, S.UNITS_HELD, details={"facility_id": options[0].facility_id})
    transition(req, S.AWAITING_DECISION)
