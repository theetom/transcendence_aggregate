import math
import re
import uuid

from django.db import transaction
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed, Throttled

from .models import PublicAPIKey, PublicAPIRateLimit


KEY_PATTERN = re.compile(r'rpk_([a-f0-9]{32})\.([A-Za-z0-9_-]{43})')
INVALID_KEY = 'A valid public API key is required.'
REQUEST_LIMIT = 60
WINDOW_SECONDS = 60


def consume_public_api_quota(user_id):
    # Caller holds an atomic transaction. get_or_create handles first-use races
    # through the unique user PK; select_for_update serializes every worker.
    PublicAPIRateLimit.objects.get_or_create(user_id=user_id)
    bucket = PublicAPIRateLimit.objects.select_for_update().get(user_id=user_id)
    now = timezone.now()
    elapsed = (now - bucket.window_start).total_seconds()
    if elapsed >= WINDOW_SECONDS:
        bucket.window_start = now
        bucket.request_count = 0
    if bucket.request_count >= REQUEST_LIMIT:
        raise Throttled(wait=max(1, math.ceil(WINDOW_SECONDS - elapsed)))
    bucket.request_count += 1
    bucket.save(update_fields=['window_start', 'request_count'])


class PublicAPIKeyAuthentication(BaseAuthentication):
    def authenticate(self, request):
        if not request.is_secure():
            raise AuthenticationFailed('Use HTTPS for the public API.')
        parts = get_authorization_header(request).split()
        if not parts:
            return None
        if len(parts) != 2 or parts[0].lower() != b'apikey':
            raise AuthenticationFailed(INVALID_KEY)
        try:
            raw_key = parts[1].decode('ascii')
        except UnicodeError:
            raise AuthenticationFailed(INVALID_KEY)
        match = KEY_PATTERN.fullmatch(raw_key)
        if match is None:
            raise AuthenticationFailed(INVALID_KEY)

        with transaction.atomic():
            try:
                key = PublicAPIKey.objects.select_for_update(of=('self',)).select_related('user').get(
                    id=uuid.UUID(hex=match.group(1)),
                )
            except PublicAPIKey.DoesNotExist:
                raise AuthenticationFailed(INVALID_KEY)
            if (not key.matches(raw_key) or key.revoked_at is not None
                    or key.expires_at <= timezone.now() or not key.user.is_active):
                raise AuthenticationFailed(INVALID_KEY)
            consume_public_api_quota(key.user_id)
        return key.user, key

    def authenticate_header(self, request):
        return 'ApiKey'
