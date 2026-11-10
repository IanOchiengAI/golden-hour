"""One helper for writing audit events, so every step records the same fields."""

from .models import AuditEvent

SYSTEM = "system"


def record(*, action, actor=None, request=None, object_type="", object_id="",
           before=None, after=None, reason=""):
    """Write one AuditEvent. `actor=None` means an automatic system step."""
    if actor is not None and getattr(actor, "is_authenticated", False):
        profile = getattr(actor, "profile", None)
        username, role, actor_obj = actor.username, (profile.role if profile else ""), actor
    else:
        username, role, actor_obj = "", SYSTEM, None
    return AuditEvent.objects.create(
        request=request,
        actor=actor_obj,
        actor_username=username,
        actor_role=role,
        action=action,
        object_type=object_type,
        object_id=str(object_id),
        before=before,
        after=after,
        reason=reason,
    )
