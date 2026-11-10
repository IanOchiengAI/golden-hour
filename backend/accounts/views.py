from django.contrib.auth import authenticate
from rest_framework import serializers, status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from emergency.audit import record

from .permissions import user_role


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class LoginView(APIView):
    """POST /auth/login → {token, role, facility_id}. Rate-limited; every attempt is audited."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        username = data.validated_data["username"]
        user = authenticate(request, username=username, password=data.validated_data["password"])
        if user is None or not hasattr(user, "profile"):
            record(action="login_failed", object_type="user", object_id=username)
            return Response({"detail": "Invalid username or password."}, status=status.HTTP_401_UNAUTHORIZED)

        token, _ = Token.objects.get_or_create(user=user)
        record(action="login", actor=user, object_type="user", object_id=username)
        return Response({
            "token": token.key,
            "username": user.username,
            "role": user_role(user),
            "facility_id": user.profile.facility_id,
        })
