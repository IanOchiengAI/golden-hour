"""
Release holds that have waited longer than hold_ttl_min (config/kenya.yaml).

The same sweep runs automatically before every new request and every
decision; this command lets a host cron run it too:

    python manage.py expire_holds
"""

from django.core.management.base import BaseCommand

from emergency.services import expire_stale_holds


class Command(BaseCommand):
    help = "Release expired unit holds and hand those requests over."

    def handle(self, *args, **opts):
        ids = expire_stale_holds()
        self.stdout.write(f"Expired {len(ids)} request(s){': ' + ', '.join(map(str, ids)) if ids else ''}")
