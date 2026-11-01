import hashlib
import hmac
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class PublicAPIKey(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='public_api_keys')
    name = models.CharField(max_length=100)
    key_digest = models.CharField(max_length=64, unique=True, editable=False)
    can_write = models.BooleanField(default=False)
    is_account_key = models.BooleanField(default=False, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    @classmethod
    def issue(cls, *, user, name, can_write=False, days=30, is_account_key=False):
        name = name.strip()
        if not user.is_active:
            raise ValueError('API keys require an active account.')
        if not name or len(name) > 100:
            raise ValueError('Choose a key name of 1 to 100 characters.')
        if type(days) is not int or not 1 <= days <= 365:
            raise ValueError('Key lifetime must be between 1 and 365 days.')
        key_id = uuid.uuid4()
        raw_key = f'rpk_{key_id.hex}.{secrets.token_urlsafe(32)}'
        key = cls.objects.create(
            id=key_id, user=user, name=name, can_write=can_write,
            is_account_key=is_account_key,
            key_digest=hashlib.sha256(raw_key.encode('ascii')).hexdigest(),
            expires_at=timezone.now() + timedelta(days=days),
        )
        return key, raw_key

    def matches(self, raw_key):
        digest = hashlib.sha256(raw_key.encode('ascii')).hexdigest()
        return hmac.compare_digest(self.key_digest, digest)

    def __str__(self):
        return f'{self.name} ({self.id})'

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user'],
                condition=models.Q(is_account_key=True, revoked_at__isnull=True),
                name='public_api_one_unrevoked_account_key',
            ),
        ]


class PublicAPIRateLimit(models.Model):
    # All keys for one account share a single bucket, including rotated keys.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        primary_key=True, related_name='public_api_rate_limit',
    )
    window_start = models.DateTimeField(default=timezone.now)
    request_count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(request_count__lte=60),
                name='public_api_rate_count_max_60',
            ),
        ]
