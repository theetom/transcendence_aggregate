"""Public service readiness without account, configuration or error details."""

import logging

from django.db import connection, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET


logger = logging.getLogger(__name__)


@require_GET
def health(request):
    database = "online"
    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL statement_timeout = '3000ms'")
                cursor.execute("SELECT 1")
                if cursor.fetchone() != (1,):
                    raise ValueError("Unexpected readiness response.")
    except Exception:
        database = "unavailable"
        logger.warning("Database readiness check failed.")
        try:
            connection.close()
        except Exception:
            pass
    ready = database == "online"
    response = JsonResponse({
        "status": "ok" if ready else "degraded",
        "checked_at": timezone.now().isoformat(),
        "services": {"backend": "online", "database": database},
    }, status=200 if ready else 503)
    response["Cache-Control"] = "no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response
