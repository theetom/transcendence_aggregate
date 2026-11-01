"""Private website-token management for the signed-in account's API key."""

from collections.abc import Mapping

from django.utils.cache import patch_vary_headers
from rest_framework import serializers
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import (
    account_key_payload,
    current_account_key,
    ensure_account_api_key,
    revoke_account_api_key,
    rotate_account_api_key,
)


class ExpectedAccountKeySerializer(serializers.Serializer):
    expected_key_id = serializers.UUIDField()


class AccountAPIKeyView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]
    renderer_classes = [JSONRenderer]
    throttle_classes = []

    def initial(self, request, *args, **kwargs):
        if not request.is_secure():
            raise PermissionDenied('Use HTTPS to manage your API key.')
        super().initial(request, *args, **kwargs)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        patch_vary_headers(response, ['Authorization'])
        return response

    def request_key_id(self, request):
        self.validate_fields(request.data, {'expected_key_id'})
        serializer = ExpectedAccountKeySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data['expected_key_id']

    @staticmethod
    def validate_fields(data, allowed_fields):
        if not isinstance(data, Mapping):
            raise serializers.ValidationError({'detail': 'Send a JSON object.'})
        if set(data) - allowed_fields:
            raise serializers.ValidationError({'detail': 'Only the expected API-key fields are accepted.'})

    def get(self, request):
        return Response(account_key_payload(request.user, current_account_key(request.user)))

    def post(self, request):
        self.validate_fields(request.data, set())
        return Response(ensure_account_api_key(request.user))

    def put(self, request):
        key_id = self.request_key_id(request)
        return Response(rotate_account_api_key(request.user, key_id))

    def delete(self, request):
        key_id = self.request_key_id(request)
        return Response(revoke_account_api_key(request.user, key_id))
