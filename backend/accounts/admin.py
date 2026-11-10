from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin

from .models import StaffProfile

User = get_user_model()


class StaffProfileInline(admin.StackedInline):
    """Role and facility shown on the user page, so a new user can be set up in one form."""
    model = StaffProfile
    can_delete = False
    fields = ("role", "facility_id", "phone")


admin.site.unregister(User)


@admin.register(User)
class StaffUserAdmin(UserAdmin):
    inlines = [StaffProfileInline]
    list_display = ("username", "role", "facility", "is_staff", "is_active", "last_login")

    @admin.display(description="Role")
    def role(self, obj):
        return getattr(getattr(obj, "profile", None), "role", "—")

    @admin.display(description="Facility")
    def facility(self, obj):
        return getattr(getattr(obj, "profile", None), "facility_id", "—")


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "facility_id")
    list_filter = ("role",)
