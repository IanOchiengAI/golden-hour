from django.urls import path

from . import views

urlpatterns = [
    path("requests", views.RequestCreateView.as_view(), name="request-create"),
    path("requests/<int:request_id>/options", views.RequestOptionsView.as_view(), name="request-options"),
]
