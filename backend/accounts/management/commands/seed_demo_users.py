"""
Create one demo user per role (synthetic, for the demo and judges).

    python manage.py seed_demo_users            # password from DEMO_PASSWORD, default demo2026
"""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from accounts.models import Role, StaffProfile

DEMO_USERS = [
    # username, role, facility_id
    ("clinician@goldenhour.health", Role.CLINICIAN, "HSP-002"),
    ("officer@goldenhour.health", Role.BLOOD_BANK_OFFICER, "RBTC-NBO"),
    ("backup.officer@goldenhour.health", Role.BLOOD_BANK_OFFICER, "RBTC-NBO"),
    ("moh@goldenhour.health", Role.MOH_OFFICER, ""),
    ("lab@goldenhour.health", Role.LAB_OFFICER, "RBTC-NBO"),
]


class Command(BaseCommand):
    help = "Create demo users for each role."

    def handle(self, *args, **opts):
        password = os.environ.get("DEMO_PASSWORD", "demo2026")
        User = get_user_model()
        for username, role, facility_id in DEMO_USERS:
            user, created = User.objects.get_or_create(username=username, defaults={"email": username})
            user.set_password(password)
            user.save()
            StaffProfile.objects.update_or_create(user=user, defaults={"role": role, "facility_id": facility_id})
            self.stdout.write(f"{'created' if created else 'updated'}  {username:<36} {role:<20} {facility_id}")
