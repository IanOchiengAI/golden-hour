"""Role checks. Every endpoint declares the roles allowed to call it."""

from rest_framework.permissions import BasePermission

from emergency.audit import record


def user_role(user):
    profile = getattr(user, "profile", None)
    return profile.role if profile else None


def roles_allowed(*roles):
    """Permission class factory: `permission_classes = [roles_allowed(Role.CLINICIAN)]`."""

    class HasRole(BasePermission):
        message = "Your role cannot perform this action."

        def has_permission(self, request, view):
            if not (request.user and request.user.is_authenticated):
                return False
            role = user_role(request.user)
            if role in roles:
                return True
            record(
                action="access_denied",
                actor=request.user,
                object_type="endpoint",
                object_id=request.path,
                after={"method": request.method, "allowed_roles": list(roles)},
            )
            return False

    HasRole.__name__ = f"HasRole_{'_'.join(roles)}"
    return HasRole
