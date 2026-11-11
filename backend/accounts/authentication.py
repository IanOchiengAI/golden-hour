"""Token login with expiry: a token older than TOKEN_TTL_HOURS is refused and deleted."""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed


def token_expired(token) -> bool:
    return token.created < timezone.now() - timedelta(hours=settings.TOKEN_TTL_HOURS)


class ExpiringTokenAuthentication(TokenAuthentication):
    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        if token_expired(token):
            from emergency.audit import record
            record(action="token_expired", actor=user, object_type="user", object_id=user.username)
            token.delete()
            raise AuthenticationFailed("Your session has expired. Please log in again.")
        return user, token
