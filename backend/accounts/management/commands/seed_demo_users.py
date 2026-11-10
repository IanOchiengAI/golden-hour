"""
Create demo users (synthetic, for the demo and judges).

    python manage.py seed_demo_users            # password from DEMO_PASSWORD, default demo2026

Besides one user per role, it creates a supplying-lab officer for every
facility (lab.<facility id>@goldenhour.health, e.g. lab.hsp-001@goldenhour.health),
because only the lab at the site a dispatch comes from may release it.
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


def lab_username(facility_id: str) -> str:
    return f"lab.{facility_id.lower()}@goldenhour.health"


class Command(BaseCommand):
    help = "Create demo users for each role, plus a lab officer per facility."

    def handle(self, *args, **opts):
        from emergency import stock

        password = os.environ.get("DEMO_PASSWORD", "demo2026")
        users = list(DEMO_USERS)
        try:
            users += [(lab_username(fid), Role.LAB_OFFICER, fid) for fid in sorted(stock.facilities())]
        except stock.StarterDataUnavailable as e:
            self.stderr.write(f"Skipping per-facility lab officers: {e}")

        User = get_user_model()
        created_count = 0
        for username, role, facility_id in users:
            user, created = User.objects.get_or_create(username=username, defaults={"email": username})
            user.set_password(password)
            user.save()
            StaffProfile.objects.update_or_create(user=user, defaults={"role": role, "facility_id": facility_id})
            created_count += created
            if (username, role, facility_id) in DEMO_USERS:
                self.stdout.write(f"{'created' if created else 'updated'}  {username:<36} {role:<20} {facility_id}")
        self.stdout.write(f"{len(users) - len(DEMO_USERS)} per-facility lab officers "
                          f"(e.g. {lab_username('HSP-001')}). {created_count} new users in total.")
