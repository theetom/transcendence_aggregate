import json
import uuid

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from public_api.models import PublicAPIKey
from public_api.services import current_account_key, lock_account_key_lifecycle


def key_metadata(key):
    return {
        'id': str(key.pk), 'username': key.user.username, 'name': key.name,
        'scope': 'read-write' if key.can_write else 'read-only',
        'created_at': key.created_at.isoformat(), 'expires_at': key.expires_at.isoformat(),
        'revoked_at': key.revoked_at.isoformat() if key.revoked_at else None,
        'active': key.revoked_at is None and key.expires_at > timezone.now() and key.user.is_active,
    }


class Command(BaseCommand):
    help = 'Create, list, rotate or revoke installation-local public API keys.'

    def add_arguments(self, parser):
        parser.add_argument('action', choices=['create', 'list', 'rotate', 'revoke'])
        parser.add_argument('--username')
        parser.add_argument('--name')
        parser.add_argument('--write', action='store_true', help='Permit writes within the account\'s existing access.')
        parser.add_argument('--days', type=int, default=30, help='Lifetime for a new key: 1–365 days (default 30).')
        parser.add_argument('--id', type=uuid.UUID, help='Key UUID for rotation or revocation.')

    def handle(self, *args, **options):
        action = options['action']
        if action in {'create', 'list'}:
            if not options['username']:
                raise CommandError('--username is required.')
            if options['id'] is not None:
                raise CommandError('--id is only for rotate/revoke.')
        elif options['id'] is None:
            raise CommandError('--id is required.')
        elif options['username'] or options['name'] or options['write']:
            raise CommandError('rotate/revoke preserve the key owner, name and scope; use --id.')
        if action == 'create' and not options['name']:
            raise CommandError('--name is required.')
        if action in {'create', 'rotate'} and not 1 <= options['days'] <= 365:
            raise CommandError('--days must be between 1 and 365.')

        try:
            with transaction.atomic():
                if action in {'create', 'list'}:
                    try:
                        user = get_user_model().objects.select_for_update().get(username=options['username'])
                    except get_user_model().DoesNotExist:
                        raise CommandError('No account has that username.')
                    if action == 'list':
                        result = [key_metadata(key) for key in PublicAPIKey.objects.filter(user=user).select_related('user').order_by('created_at', 'id')]
                    else:
                        key, raw_key = PublicAPIKey.issue(
                            user=user, name=options['name'], can_write=options['write'], days=options['days'],
                        )
                        result = {**key_metadata(key), 'api_key': raw_key}
                else:
                    try:
                        owner_id = PublicAPIKey.objects.values_list('user_id', flat=True).get(pk=options['id'])
                    except PublicAPIKey.DoesNotExist:
                        raise CommandError('No API key has that id.')
                    lock_account_key_lifecycle(owner_id)
                    try:
                        key = PublicAPIKey.objects.select_for_update(of=('self',)).select_related('user').get(
                            pk=options['id'], user_id=owner_id,
                        )
                    except PublicAPIKey.DoesNotExist:
                        raise CommandError('No API key has that id.')
                    if action == 'rotate':
                        if key.revoked_at is not None:
                            raise CommandError('This key is already revoked; create a new key instead.')
                        if key.is_account_key:
                            current = current_account_key(key.user, for_update=True)
                            if current is None or current.pk != key.pk:
                                raise CommandError('This account key changed; reload its current id before rotating.')
                        key.revoked_at = timezone.now()
                        key.save(update_fields=['revoked_at'])
                        replacement, raw_key = PublicAPIKey.issue(
                            user=key.user, name=key.name, can_write=key.can_write, days=options['days'],
                            is_account_key=key.is_account_key,
                        )
                        result = {**key_metadata(replacement), 'api_key': raw_key, 'revoked_key_id': str(key.pk)}
                    else:
                        if key.revoked_at is None:
                            key.revoked_at = timezone.now()
                            key.save(update_fields=['revoked_at'])
                        result = key_metadata(key)
        except ValueError as error:
            raise CommandError(str(error))
        # Commit before revealing the secret; never print a digest or stored hash.
        self.stdout.write(json.dumps(result, indent=2))
        if action in {'create', 'rotate'}:
            self.stderr.write('Copy api_key now. It is shown once; keep it out of Git, URLs and shared exports.')
