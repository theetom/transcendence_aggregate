from django.contrib.auth import get_user_model
from django.db import transaction

from rest_framework.decorators import api_view
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework import status

from .models import UserProfile
from .serializers import SignupSerializer, UserProfileSerializer


User = get_user_model()

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