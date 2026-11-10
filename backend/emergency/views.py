from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.models import Role
from accounts.permissions import roles_allowed

from . import services, stock
from .audit import record
from .country import data_as_of, get_config
from .models import Dispatch, DispatchStatus, EmergencyRequest, Status, Urgency
from .serializers import (
    AuditEventSerializer, AuthoriseSerializer, CreateRequestSerializer, DecisionSerializer, DispatchSerializer,
    DispatchStatusSerializer, OptionSerializer, ReleaseSerializer, RequestDetailSerializer, RequestSerializer,
    RequestSummarySerializer,
)

REQUEST_READERS = (Role.CLINICIAN, Role.BLOOD_BANK_OFFICER, Role.MOH_OFFICER)
DISPATCH_READERS = (Role.LAB_OFFICER, Role.CLINICIAN)


def starter_data_down(e):
    return Response({"detail": str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


# ── Who can see what ─────────────────────────────────────────────────────
def visible_requests(user):
    """Clinicians see their own hospital's requests; officers and MoH see all."""
    qs = EmergencyRequest.objects.all()
    if user.profile.role == Role.CLINICIAN:
        qs = qs.filter(requesting_facility_id=user.profile.facility_id)
    return qs


def visible_dispatches(user):
    """Labs see dispatches from their site; clinicians see dispatches to their hospital."""
    qs = Dispatch.objects.select_related("request", "option")
    if user.profile.role == Role.LAB_OFFICER:
        return qs.filter(from_facility_id=user.profile.facility_id)
    return qs.filter(to_facility_id=user.profile.facility_id)


def list_params(request, allowed_statuses):
    """Parse ?status= (repeatable or comma-separated), ?urgency= and ?limit= (1–200, default 50)."""
    statuses = [s for v in request.query_params.getlist("status") for s in v.split(",") if s]
    bad = [s for s in statuses if s not in allowed_statuses]
    if bad:
        raise ValidationError({"status": [f"Unknown status: {', '.join(bad)}"]})
    urgency = request.query_params.get("urgency")
    if urgency and urgency not in Urgency.values:
        raise ValidationError({"urgency": [f"Unknown urgency: {urgency}"]})
    raw_limit = request.query_params.get("limit", "50")
    if not raw_limit.isdigit() or not 1 <= int(raw_limit) <= 200:
        raise ValidationError({"limit": ["limit must be a number from 1 to 200."]})
    return statuses, urgency, int(raw_limit)


def facility_names():
    try:
        return {fid: f["name"] for fid, f in stock.facilities().items()}
    except stock.StarterDataUnavailable:
        return {}


class RequestCreateView(APIView):
    """
    POST /requests — clinician raises a request.
    Matching and the auto-hold run here, so the officer's options are ready at once.

    GET /requests — work queues: ?status= (repeatable), ?urgency=, ?limit=.
    Clinicians see only their own hospital's requests.
    """

    throttle_scope = "raise_request"   # per-user rate limit on raising requests

    def get_permissions(self):
        roles = REQUEST_READERS if self.request.method == "GET" else (Role.CLINICIAN,)
        return [roles_allowed(*roles)()]

    def get_throttles(self):
        return [ScopedRateThrottle()] if self.request.method == "POST" else []

    def get(self, request):
        statuses, urgency, limit = list_params(request, Status.values)
        qs = visible_requests(request.user).prefetch_related("holds__option", "dispatches")
        if statuses:
            qs = qs.filter(status__in=statuses)
        if urgency:
            qs = qs.filter(urgency=urgency)
        qs = qs.order_by("-created_at", "-id")[:limit]
        return Response({"results": RequestSummarySerializer(qs, many=True).data})

    def post(self, request):
        data = CreateRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        fields = data.validated_data

        # Idempotency: a retry with the same client_request_id returns the original.
        replay = self._replay(request.user, fields)
        if replay is not None:
            return replay

        facility_id = request.user.profile.facility_id
        services.expire_stale_holds()   # timed-out requests don't count towards the cap
        if services.open_request_count(facility_id) >= int(get_config().get("max_open_requests_per_facility", 10)):
            record(action="request_refused_cap", actor=request.user, object_type="facility", object_id=facility_id,
                   reason="Too many open requests for this facility")
            return Response(
                {"detail": f"{facility_id} already has the maximum number of open requests. "
                           "Complete or cancel one, or call the blood bank."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        try:
            facility = stock.get_facility(facility_id) if facility_id else None
            if facility is None:
                return Response(
                    {"detail": "Your account is not linked to a known facility."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            req = services.create_request(user=request.user, requesting_facility_id=facility_id, **fields)
        except stock.StarterDataUnavailable as e:
            return starter_data_down(e)
        except IntegrityError:
            # Two copies of the same retry arrived together; the other one won.
            replay = self._replay(request.user, fields)
            if replay is not None:
                return replay
            raise

        return Response(RequestSerializer(req).data, status=status.HTTP_201_CREATED)

    REPLAY_FIELDS = ("patient_blood_group", "component", "units_requested", "urgency", "clinical_note")

    def _replay(self, user, fields):
        """200 with the original request if this client_request_id was already used; 409 if reused differently."""
        cid = fields.get("client_request_id")
        if not cid:
            return None
        existing = EmergencyRequest.objects.filter(raised_by=user, client_request_id=cid).first()
        if existing is None:
            return None
        if any(getattr(existing, f) != fields[f] for f in self.REPLAY_FIELDS):
            return Response({"detail": f"client_request_id {cid} was already used for a different request."},
                            status=status.HTTP_409_CONFLICT)
        return Response(RequestSerializer(existing).data, status=status.HTTP_200_OK)


class RequestOptionsView(APIView):
    """
    GET /requests/{id}/options — blood bank officer sees the ranked sites.
    Read-only: the options and the hold were made when the request was raised.
    """

    permission_classes = [roles_allowed(Role.BLOOD_BANK_OFFICER)]

    def get(self, request, request_id):
        req = get_object_or_404(EmergencyRequest, pk=request_id)
        options = list(req.options.all())
        held_option_ids = set(
            req.holds.filter(released_at__isnull=True).values_list("option_id", flat=True)
        )
        return Response({
            "request": RequestSerializer(req).data,
            "method": req.eta_method,
            "ai_offline": req.eta_method == "fallback",
            "data_as_of": data_as_of().isoformat(),
            "held_option_id": next(iter(held_option_ids), None),
            "options": OptionSerializer(options, many=True, context={"held_option_ids": held_option_ids}).data,
        })


class DecisionView(APIView):
    """
    POST /requests/{id}/decision — blood bank officer: accept, change or reject.
    Accept and change then follow the authorisation tier in config/kenya.yaml.
    """

    permission_classes = [roles_allowed(Role.BLOOD_BANK_OFFICER)]

    def post(self, request, request_id):
        req = get_object_or_404(EmergencyRequest, pk=request_id)
        data = DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.expire_stale_holds()   # commits on its own; a timed-out request now gives 409
        req = services.decide(req, actor=request.user, **data.validated_data)
        return Response(RequestDetailSerializer(req).data)


class AuthoriseView(APIView):
    """POST /requests/{id}/authorise — MoH authorising officer: approve, reject, stop or review."""

    permission_classes = [roles_allowed(Role.MOH_OFFICER)]

    def post(self, request, request_id):
        req = get_object_or_404(EmergencyRequest, pk=request_id)
        data = AuthoriseSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.expire_stale_holds()
        req = services.authorise(req, actor=request.user, **data.validated_data)
        return Response(RequestDetailSerializer(req).data)


def _require_facility(request, facility_id, what):
    """Role checks pass already; this checks the caller works at the right site. Refusals are audited."""
    profile = request.user.profile
    if profile.facility_id != facility_id:
        record(action="access_denied", actor=request.user, object_type="endpoint", object_id=request.path,
               after={"method": request.method, "reason": f"not at {what} facility {facility_id}"})
        raise PermissionDenied(f"Only staff at {facility_id} can do this.")


def _dispatch_response(dispatch, warnings=()):
    dispatch.refresh_from_db()
    return Response({
        "dispatch": DispatchSerializer(dispatch).data,
        "request_status": dispatch.request.status,
        "warnings": list(warnings),
    })


class DispatchReleaseView(APIView):
    """
    POST /dispatches/{id}/release — lab officer at the supplying site confirms or declines.
    A decline holds the next-ranked site and sends the request back to the officer.
    """

    permission_classes = [roles_allowed(Role.LAB_OFFICER)]

    def post(self, request, dispatch_id):
        dispatch = get_object_or_404(Dispatch.objects.select_related("request", "option"), pk=dispatch_id)
        _require_facility(request, dispatch.from_facility_id, "supplying")
        data = ReleaseSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.release(dispatch, actor=request.user, **data.validated_data)
        return _dispatch_response(dispatch)


class DispatchStatusView(APIView):
    """
    POST /dispatches/{id}/status — in_transit by the supplying lab officer,
    received by a clinician at the requesting hospital.
    """

    permission_classes = [roles_allowed(Role.LAB_OFFICER, Role.CLINICIAN)]

    def post(self, request, dispatch_id):
        dispatch = get_object_or_404(Dispatch.objects.select_related("request", "option"), pk=dispatch_id)
        data = DispatchStatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        new_status = data.validated_data["status"]
        role = request.user.profile.role
        if new_status == "in_transit":
            if role != Role.LAB_OFFICER:
                raise PermissionDenied("Only the supplying lab officer marks units in transit.")
            _require_facility(request, dispatch.from_facility_id, "supplying")
        else:
            if role != Role.CLINICIAN:
                raise PermissionDenied("Only a clinician at the requesting hospital confirms receipt.")
            _require_facility(request, dispatch.to_facility_id, "requesting")
        dispatch, warnings = services.update_dispatch_status(dispatch, actor=request.user, **data.validated_data)
        return _dispatch_response(dispatch, warnings)


class AuditView(APIView):
    """
    GET /audit?request_id= — the full trail for one request, oldest first.
    Officers and MoH only: audit events contain patient fields, so supplying labs are refused.
    """

    permission_classes = [roles_allowed(Role.BLOOD_BANK_OFFICER, Role.MOH_OFFICER)]

    def get(self, request):
        raw = request.query_params.get("request_id", "")
        if not raw.isdigit():
            return Response({"request_id": ["A numeric request_id is required."]}, status=status.HTTP_400_BAD_REQUEST)
        req = get_object_or_404(EmergencyRequest, pk=int(raw))
        events = req.audit_events.order_by("created_at", "id")
        return Response({
            "request_id": req.pk,
            "status": req.status,
            "events": AuditEventSerializer(events, many=True).data,
        })


class RequestDetailView(APIView):
    """
    GET /requests/{id} — one request for the status-tracking screen: the request,
    its ranked options, the held option and its current dispatch.
    A clinician asking for another hospital's request gets 404 (ids are not leaked).
    """

    permission_classes = [roles_allowed(*REQUEST_READERS)]

    def get(self, request, request_id):
        req = get_object_or_404(visible_requests(request.user), pk=request_id)
        data = RequestDetailSerializer(req).data
        held_ids = {data["held_option_id"]} if data["held_option_id"] else set()
        data["options"] = OptionSerializer(req.options.all(), many=True,
                                           context={"held_option_ids": held_ids}).data
        return Response(data)


class DispatchListView(APIView):
    """
    GET /dispatches — labs: dispatches from their site; clinicians: dispatches to
    their hospital. ?status= (repeatable), ?limit=. Supplier-safe fields only.
    """

    permission_classes = [roles_allowed(*DISPATCH_READERS)]

    def get(self, request):
        statuses, _, limit = list_params(request, DispatchStatus.values)
        qs = visible_dispatches(request.user)
        if statuses:
            qs = qs.filter(status__in=statuses)
        qs = qs.order_by("-created_at", "-id")[:limit]
        return Response({"results": DispatchSerializer(qs, many=True,
                                                       context={"facility_names": facility_names()}).data})


class DispatchDetailView(APIView):
    """GET /dispatches/{id} — same visibility as the list; 404 for other sites' dispatches."""

    permission_classes = [roles_allowed(*DISPATCH_READERS)]

    def get(self, request, dispatch_id):
        dispatch = get_object_or_404(visible_dispatches(request.user), pk=dispatch_id)
        return Response(DispatchSerializer(dispatch).data)
