from django.contrib import admin
from django.urls import include, path

from accounts.views import LoginView

# Paths match the agreed API contract exactly (no /api prefix, no trailing slash).
urlpatterns = [
    path("admin/", admin.site.urls),
    path("auth/login", LoginView.as_view(), name="login"),
    path("", include("emergency.urls")),
]
