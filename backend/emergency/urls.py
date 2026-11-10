from django.urls import path

from . import views

urlpatterns = [
    path("requests", views.RequestCreateView.as_view(), name="request-create"),
]
