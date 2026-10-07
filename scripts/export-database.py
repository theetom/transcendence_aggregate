"""Run inside the backend: python - [sqlite_backup_path] < this file."""

import datetime
import os
import sys
from pathlib import Path
from unittest.mock import patch

import django
from django.conf import settings
from django.core import serializers
from django.core.management import call_command
from django.core.serializers import json as django_json
from django.utils.timezone import is_aware


class FullPrecisionEncoder(django_json.DjangoJSONEncoder):
    """Keep all timestamp digits; Django's default JSON encoder trims them."""

    def default(self, value):
        if isinstance(value, datetime.datetime):
            encoded = value.isoformat()
            return encoded.removesuffix("+00:00") + "Z" if encoded.endswith("+00:00") else encoded
        if isinstance(value, datetime.time):
            if is_aware(value):
                raise ValueError("Timezone-aware times cannot be exported to JSON.")
            return value.isoformat()
        return super().default(value)


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
if len(sys.argv) > 2:
    sys.exit("Supply at most one SQLite backup path.")
if len(sys.argv) == 2:
    if settings.DATABASES["default"]["ENGINE"] != "django.db.backends.sqlite3":
        sys.exit("A backup path can only be used with the SQLite connection.")
    backup = Path(sys.argv[1])
    if not backup.is_file():
        sys.exit("The SQLite backup is missing.")
    settings.DATABASES["default"]["NAME"] = backup

django.setup()
# Load the registered serializer before changing its encoder for this process.
serializers.get_serializer("json")
with patch.object(django_json, "DjangoJSONEncoder", FullPrecisionEncoder):
    call_command(
        "dumpdata",
        format="json",
        use_base_manager=True,
        use_natural_foreign_keys=True,
        use_natural_primary_keys=False,
        verbosity=0,
        stdout=sys.stdout,
    )
