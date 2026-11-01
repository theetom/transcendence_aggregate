"""Account-owned API-key lifecycle; raw secrets leave only issuance responses."""

from django.db import connection, transaction
from django.utils import timezone
from rest_framework.exceptions import APIException

from .models import PublicAPIKey


ACCOUNT_KEY_NAME = 'Account API access'


class AccountAPIKeyChanged(APIException):
    status_code = 409
    default_code = 'api_key_changed'

    def __init__(self):
        super().__init__({
            'code': 'api_key_changed',
            'detail': 'Your API key changed. Reload its details before trying again.',
        })


def lock_account_key_lifecycle(user_id):
    # This per-account lifecycle lock avoids an exclusive User row lock.
    # Authentication locks a key before creating its user-linked quota row.
    # Taking User FOR UPDATE here would invert that lock order.
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(%s, %s)', [730018, user_id])


def current_account_key(user, *, for_update=False):
    keys = PublicAPIKey.objects.filter(user=user, is_account_key=True).select_related('user')
    if for_update:
        keys = keys.select_for_update(of=('self',))
    # Include revoked and expired history: ensure must never silently re-enable it.
    return keys.order_by('-created_at', '-id').first()


def account_key_metadata(key):
    return {
        'id': str(key.pk),
        'name': key.name,
        'scope': 'read-write' if key.can_write else 'read-only',
        'created_at': key.created_at.isoformat(),
        'expires_at': key.expires_at.isoformat(),
        'revoked_at': key.revoked_at.isoformat() if key.revoked_at else None,
        'active': key.revoked_at is None and key.expires_at > timezone.now() and key.user.is_active,
    }


def account_key_payload(user, key, raw_key=None):
    data = {'user_id': user.pk, 'key': account_key_metadata(key) if key else None}
    if raw_key is not None:
        data['api_key'] = raw_key
    return data


@transaction.atomic
def ensure_account_api_key(user):
    lock_account_key_lifecycle(user.pk)
    key = current_account_key(user, for_update=True)
    raw_key = None
    if key is None:
        key, raw_key = PublicAPIKey.issue(
            user=user, name=ACCOUNT_KEY_NAME, can_write=True, is_account_key=True,
        )
    return account_key_payload(user, key, raw_key)


@transaction.atomic
def rotate_account_api_key(user, expected_key_id):
    lock_account_key_lifecycle(user.pk)
    key = current_account_key(user, for_update=True)
    if key is None or key.pk != expected_key_id:
        raise AccountAPIKeyChanged()
    if key.revoked_at is None:
        key.revoked_at = timezone.now()
        key.save(update_fields=['revoked_at'])
    replacement, raw_key = PublicAPIKey.issue(
        user=user, name=ACCOUNT_KEY_NAME, can_write=True, is_account_key=True,
    )
    return account_key_payload(user, replacement, raw_key)


@transaction.atomic
def revoke_account_api_key(user, expected_key_id):
    lock_account_key_lifecycle(user.pk)
    key = current_account_key(user, for_update=True)
    if key is None or key.pk != expected_key_id:
        raise AccountAPIKeyChanged()
    if key.revoked_at is None:
        key.revoked_at = timezone.now()
        key.save(update_fields=['revoked_at'])
    return account_key_payload(user, key)
