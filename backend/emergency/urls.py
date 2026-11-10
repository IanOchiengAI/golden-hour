from django.urls import path

from . import views

urlpatterns = [
    path("requests", views.RequestCreateView.as_view(), name="request-create"),
    path("requests/<int:request_id>/options", views.RequestOptionsView.as_view(), name="request-options"),
    path("requests/<int:request_id>/decision", views.DecisionView.as_view(), name="request-decision"),
    path("requests/<int:request_id>/authorise", views.AuthoriseView.as_view(), name="request-authorise"),
    path("dispatches/<int:dispatch_id>/release", views.DispatchReleaseView.as_view(), name="dispatch-release"),
    path("dispatches/<int:dispatch_id>/status", views.DispatchStatusView.as_view(), name="dispatch-status"),
]
