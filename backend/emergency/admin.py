"""
Admin is for looking, not changing: requests, options, holds and the audit log
are view-only here, so nobody can skip the status rules or edit the audit trail.
Workflow changes go through the API, which checks roles and writes audit events.
"""

from django.contrib import admin

from .models import AuditEvent, EmergencyRequest, RankedOption, UnitHold


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class RankedOptionInline(admin.TabularInline):
    model = RankedOption
    fields = ("rank", "facility_id", "facility_name", "eta_low_min", "eta_mid_min", "eta_high_min",
              "method", "units_available", "is_partial", "reason")
    readonly_fields = fields
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class UnitHoldInline(admin.TabularInline):
    model = UnitHold
    fields = ("unit_id", "facility_id", "held_at", "released_at", "release_reason")
    readonly_fields = fields
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class AuditEventInline(admin.TabularInline):
    model = AuditEvent
    fields = ("created_at", "actor_username", "actor_role", "action", "before", "after", "reason")
    readonly_fields = fields
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(EmergencyRequest)
class EmergencyRequestAdmin(ReadOnlyAdmin):
    list_display = ("id", "created_at", "requesting_facility_id", "patient_blood_group", "component",
                    "units_requested", "urgency", "status", "eta_method")
    list_filter = ("status", "urgency", "component", "eta_method")
    search_fields = ("id", "requesting_facility_id")
    inlines = [RankedOptionInline, UnitHoldInline, AuditEventInline]


@admin.register(UnitHold)
class UnitHoldAdmin(ReadOnlyAdmin):
    list_display = ("unit_id", "facility_id", "request", "active", "held_at", "released_at", "release_reason")
    list_filter = ("facility_id",)
    search_fields = ("unit_id",)

    @admin.display(boolean=True, description="Active")
    def active(self, obj):
        return obj.released_at is None


@admin.register(AuditEvent)
class AuditEventAdmin(ReadOnlyAdmin):
    list_display = ("created_at", "actor_username", "actor_role", "action", "object_type", "object_id", "request")
    list_filter = ("action", "actor_role")
    search_fields = ("actor_username", "object_id", "request__id")
