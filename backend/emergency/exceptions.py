"""API error mapping: workflow conflicts become 409 with a plain message."""

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from .models import RankedOption
from .services import InvalidTransition, UnitsUnavailable


class Conflict(APIException):
    """The request is not in a state that allows this action, or units were just taken."""
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This action conflicts with the request's current state."
    default_code = "conflict"


def exception_handler(exc, context):
    if isinstance(exc, (InvalidTransition, UnitsUnavailable)):
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    if isinstance(exc, RankedOption.DoesNotExist):
        return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
    return drf_exception_handler(exc, context)
