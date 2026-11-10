"""
Request workflow. Every status change goes through transition(), which refuses
moves the lifecycle does not allow and writes an AuditEvent.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone

from . import matching
from .audit import record
from .country import get_config
from .models import (
    AuthorisationRoute, Dispatch, DispatchStatus, EmergencyRequest, RankedOption, Status, UnitHold, Urgency,
)

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


class UnitsUnavailable(Exception):
    """The chosen site's units were just reserved for another request. The API returns 409."""


def require_status(req: EmergencyRequest, allowed, action: str):
    """Refuse an action unless the request is in one of the allowed statuses."""
    if req.status not in allowed:
        raise InvalidTransition(
            f"Request {req.pk} is {req.status}; '{action}' needs {' or '.join(str(s) for s in allowed)}."
        )


def held_option(req: EmergencyRequest):
    """The option whose units are currently reserved for this request, or None."""
    hold = req.holds.filter(released_at__isnull=True).select_related("option").first()
    return hold.option if hold else None


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


def _locked(req: EmergencyRequest) -> EmergencyRequest:
    """Re-read the request inside the transaction (row lock on PostgreSQL) so two people can't act at once."""
    return EmergencyRequest.objects.select_for_update().get(pk=req.pk)


# ── Dispatch creation ────────────────────────────────────────────────────
def create_dispatch(req: EmergencyRequest, option: RankedOption, *, actor=None) -> Dispatch:
    """Hand the held units to the supplying site. Called on SentToSupplier."""
    unit_ids = list(req.holds.filter(option=option, released_at__isnull=True).values_list("unit_id", flat=True))
    dispatch = Dispatch.objects.create(
        request=req, option=option, from_facility_id=option.facility_id,
        to_facility_id=req.requesting_facility_id, unit_ids=unit_ids,
    )
    record(
        action="dispatch_created", actor=actor, request=req, object_type="dispatch", object_id=dispatch.pk,
        after={"from_facility_id": dispatch.from_facility_id, "to_facility_id": dispatch.to_facility_id,
               "unit_ids": unit_ids},
    )
    return dispatch


def open_dispatch(req: EmergencyRequest):
    return req.dispatches.filter(
        status__in=[DispatchStatus.AWAITING_RELEASE, DispatchStatus.RELEASED, DispatchStatus.IN_TRANSIT]
    ).first()


# ── Authorisation tier ───────────────────────────────────────────────────
def authorisation_route_for(req: EmergencyRequest) -> str:
    """
    From config: life-threatening requests go ahead under the MoH standing
    authorisation when emergency_authorisation is 'standing'. Everything else
    waits for an MoH officer to approve.
    """
    standing = get_config()["emergency_authorisation"] == "standing"
    if standing and req.urgency == Urgency.LIFE_THREATENING:
        return AuthorisationRoute.STANDING
    return AuthorisationRoute.PER_TRANSFER


def _apply_authorisation_tier(req: EmergencyRequest, option: RankedOption, actor):
    route = authorisation_route_for(req)
    req.authorisation_route = route
    req.save(update_fields=["authorisation_route", "updated_at"])
    if route == AuthorisationRoute.STANDING:
        transition(req, S.SENT_TO_SUPPLIER, actor=actor,
                   reason="Life-threatening: proceeding under MoH standing authorisation",
                   details={"authorisation_route": route})
        create_dispatch(req, option, actor=actor)
        record(
            action="moh_notified", actor=actor, request=req, object_type="request", object_id=req.pk,
            after={"authorisation_route": route, "facility_id": option.facility_id},
            reason="MoH officer notified; can stop the transfer before release and reviews afterwards",
        )
    else:
        transition(req, S.AWAITING_AUTHORISATION, actor=actor, details={"authorisation_route": route})


# ── Blood bank officer decision ──────────────────────────────────────────
DECIDABLE = (S.AWAITING_DECISION, S.ESCALATED)


@transaction.atomic
def decide(req: EmergencyRequest, *, actor, action: str, option_id=None, reason="") -> EmergencyRequest:
    """
    accept: keep the held site.
    change: move the hold to another ranked site (409 if its units were just taken).
    reject: release the hold; the request is handled manually.
    Accept and change then apply the authorisation tier from config.
    """
    req = _locked(req)
    require_status(req, DECIDABLE, action)
    current = held_option(req)

    if action == "reject":
        release_holds(req, reason=f"Rejected by officer: {reason}", actor=actor)
        record(action="decision_rejected", actor=actor, request=req, object_type="request",
               object_id=req.pk, before={"option_id": current.pk if current else None}, reason=reason)
        transition(req, S.HANDLED_MANUALLY, actor=actor, reason=reason)
        return req

    if action == "accept":
        if current is None:
            raise InvalidTransition(f"Request {req.pk} has no units held; choose an option with 'change'.")
        if option_id is not None and int(option_id) != current.pk:
            raise InvalidTransition(f"Option {option_id} is not the held option; use 'change' to switch.")
        record(action="decision_accepted", actor=actor, request=req, object_type="option",
               object_id=current.pk, after={"facility_id": current.facility_id, "rank": current.rank},
               reason=reason)
        _apply_authorisation_tier(req, current, actor)
        return req

    if action == "change":
        new = req.options.filter(pk=option_id).first()
        if new is None:
            raise RankedOption.DoesNotExist(f"Option {option_id} does not belong to request {req.pk}")
        if current is not None and new.pk == current.pk:
            raise InvalidTransition(f"Option {option_id} is already held; use 'accept'.")
        try:
            with transaction.atomic():   # savepoint: on failure the old hold stays
                release_holds(req, reason=f"Changed by officer: {reason}", actor=actor)
                hold_option(req, new, actor=actor, reason=f"Changed by officer: {reason}")
        except IntegrityError:
            raise UnitsUnavailable(
                f"Units at {new.facility_name} were just reserved for another request. Choose another option."
            )
        record(
            action="decision_changed", actor=actor, request=req, object_type="option", object_id=new.pk,
            before={"option_id": current.pk if current else None,
                    "facility_id": current.facility_id if current else None},
            after={"option_id": new.pk, "facility_id": new.facility_id, "rank": new.rank},
            reason=reason,
        )
        _apply_authorisation_tier(req, new, actor)
        return req

    raise ValueError(f"Unknown decision action: {action}")


# ── MoH authorising officer ──────────────────────────────────────────────
@transaction.atomic
def authorise(req: EmergencyRequest, *, actor, action: str, reason="") -> EmergencyRequest:
    """
    approve / reject: per-transfer requests waiting in AwaitingAuthorisation.
    stop:   standing-route requests already sent to the supplier, before the lab releases.
    review: after-the-fact review of a standing-route request; audit only.
    """
    req = _locked(req)

    if action in ("approve", "reject"):
        require_status(req, (S.AWAITING_AUTHORISATION,), action)
        if action == "approve":
            option = held_option(req)
            if option is None:
                raise InvalidTransition(f"Request {req.pk} has no units held.")
            record(action="authorisation_approved", actor=actor, request=req, object_type="request",
                   object_id=req.pk, after={"facility_id": option.facility_id}, reason=reason)
            transition(req, S.SENT_TO_SUPPLIER, actor=actor, reason=reason or "Approved by MoH")
            create_dispatch(req, option, actor=actor)
        else:
            release_holds(req, reason=f"Not approved by MoH: {reason}", actor=actor)
            record(action="authorisation_rejected", actor=actor, request=req, object_type="request",
                   object_id=req.pk, reason=reason)
            transition(req, S.HANDLED_MANUALLY, actor=actor, reason=reason)
        return req

    if action == "stop":
        require_status(req, (S.SENT_TO_SUPPLIER,), action)
        dispatch = open_dispatch(req)
        if req.authorisation_route != AuthorisationRoute.STANDING or dispatch is None \
                or dispatch.status != DispatchStatus.AWAITING_RELEASE:
            raise InvalidTransition(
                f"Request {req.pk} can only be stopped while under standing authorisation and before release."
            )
        dispatch.status = DispatchStatus.CANCELLED
        dispatch.save(update_fields=["status"])
        release_holds(req, reason=f"Stopped by MoH: {reason}", actor=actor)
        record(action="authorisation_stopped", actor=actor, request=req, object_type="dispatch",
               object_id=dispatch.pk, before={"status": DispatchStatus.AWAITING_RELEASE},
               after={"status": DispatchStatus.CANCELLED}, reason=reason)
        transition(req, S.HANDLED_MANUALLY, actor=actor, reason=reason)
        return req

    if action == "review":
        if req.authorisation_route != AuthorisationRoute.STANDING:
            raise InvalidTransition(f"Request {req.pk} was not sent under standing authorisation.")
        record(action="authorisation_reviewed", actor=actor, request=req, object_type="request",
               object_id=req.pk, after={"status": req.status}, reason=reason)
        return req

    raise ValueError(f"Unknown authorisation action: {action}")
