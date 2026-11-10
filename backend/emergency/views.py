from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from accounts.permissions import roles_allowed

from . import services, stock
from .serializers import CreateRequestSerializer, RequestSerializer


def starter_data_down(e):
    return Response({"detail": str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class RequestCreateView(APIView):
    """
    POST /requests — clinician raises a request.
    Matching and the auto-hold run here, so the officer's options are ready at once.
    """

    permission_classes = [roles_allowed(Role.CLINICIAN)]

    def post(self, request):
        data = CreateRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)

        facility_id = request.user.profile.facility_id
        try:
            facility = stock.get_facility(facility_id) if facility_id else None
            if facility is None:
                return Response(
                    {"detail": "Your account is not linked to a known facility."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            req = services.create_request(user=request.user, requesting_facility_id=facility_id,
                                          **data.validated_data)
        except stock.StarterDataUnavailable as e:
            return starter_data_down(e)

        return Response(RequestSerializer(req).data, status=status.HTTP_201_CREATED)
