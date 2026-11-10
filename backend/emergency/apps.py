import os
import sys
import threading

from django.apps import AppConfig


class EmergencyConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "emergency"

    def ready(self):
        # The ETA model takes ~5 s to load. Load it in the background when the
        # server starts so the first request does not wait. Skipped for
        # migrate/test/etc.; set WARM_ML_MODEL=0 to turn it off.
        serving = "runserver" in sys.argv or "gunicorn" in os.path.basename(sys.argv[0])
        if serving and os.environ.get("WARM_ML_MODEL", "1") == "1":
            from .matching import warm_model
            threading.Thread(target=warm_model, daemon=True, name="warm-eta-model").start()
