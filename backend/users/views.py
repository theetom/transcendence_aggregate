from django.contrib.auth import get_user_model
from django.db import transaction

from rest_framework.decorators import api_view, permission_classes
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.generics import get_object_or_404

from .models import UserProfile
from .serializers import (
    SignupSerializer,
    UserProfileSerializer,
    UsernameOrEmailAuthTokenSerializer,
)


User = get_user_model()

class WebsiteLoginView(ObtainAuthToken):
    serializer_class = UsernameOrEmailAuthTokenSerializer

@api_view(["GET"])
def users_list(request):
    users = UserProfile.objects.all()
    serializer = UserProfileSerializer(users, many=True)
    return Response(serializer.data)


@api_view(["POST"])
def sign_up(request):
    serializer = SignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    with transaction.atomic():
        user = User.objects.create_user(
            username=serializer.validated_data["username"],
            email=serializer.validated_data.get("email", ""),
            password=serializer.validated_data["password"],
        )
        UserProfile.objects.create(user=user)
        token = Token.objects.create(user=user)

    return Response(
        {
            "token": token.key,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
            },
        },
        status=status.HTTP_201_CREATED,
    )

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    request.auth.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_me(request):
    profile = get_object_or_404(UserProfile, user=request.user)
    serializer = UserProfileSerializer(profile)
    return Response(serializer.data)

@api_view(["GET"])
def user_detail(request, user_name):
    users = UserProfile.objects.get(username=user_name)
    serializer = UserProfileSerializer(users, many=True)
    return Response(serializer.data)