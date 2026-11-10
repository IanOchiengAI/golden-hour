from django.conf import settings
from django.db import models


class Role(models.TextChoices):
    CLINICIAN = "clinician", "Clinician"
    BLOOD_BANK_OFFICER = "blood_bank_officer", "Blood bank officer"
    MOH_OFFICER = "moh_officer", "MoH authorising officer"
    LAB_OFFICER = "lab_officer", "Supplying lab officer"


class StaffProfile(models.Model):
    """One role per user, plus the facility they work at (a starter-data facility_id)."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=32, choices=Role.choices)
    facility_id = models.CharField(max_length=16, blank=True)
    phone = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return f"{self.user.username} ({self.role} @ {self.facility_id or '-'})"
