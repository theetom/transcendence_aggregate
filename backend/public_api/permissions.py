from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import PublicAPIKey


class PublicAPIKeyPermission(BasePermission):
    message = 'This API key does not allow this action.'

    def has_permission(self, request, view):
        key = request.auth
        return (
            isinstance(key, PublicAPIKey)
            and request.user.is_authenticated
            and request.user.is_active
            and key.user_id == request.user.pk
            and (request.method in SAFE_METHODS or key.can_write)
        )
