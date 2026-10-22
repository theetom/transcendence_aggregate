import logging

from django.contrib.auth import get_user_model
from django.db import transaction

from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.generics import get_object_or_404

from .models import UserProfile
from .serializers import (
    SignupSerializer,
    CurrentUserProfileSerializer,
    UserProfileSerializer,
    UserProfileUpdateSerializer,
    UsernameOrEmailAuthTokenSerializer,
)
from recipes.models import Recipe
from recipes.serializers import RecipeSummarySerializer


logger = logging.getLogger(__name__)
User = get_user_model()

class WebsiteLoginView(ObtainAuthToken):
    serializer_class = UsernameOrEmailAuthTokenSerializer

@api_view(["GET"])
def users_list(request):
    users = UserProfile.objects.select_related("user").order_by("user__username", "user_id")
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

def _current_profile_data(profile):
    data = CurrentUserProfileSerializer(profile).data
    submitted_recipes = (
        Recipe.objects.filter(user_id=profile.user_id)
        .prefetch_related("images")
        .order_by("-date_created", "-id")
    )
    data["submitted_recipes"] = RecipeSummarySerializer(submitted_recipes, many=True).data
    return data


def _delete_unreferenced_profile_photo(storage, name):
    try:
        if not UserProfile.objects.filter(profile_picture=name).exists():
            storage.delete(name)
    except Exception:
        logger.exception("Could not remove replaced profile photo %s.", name)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, FormParser, MultiPartParser])
def user_me(request):
    if request.method == "GET":
        profile = get_object_or_404(UserProfile, user=request.user)
        return Response(_current_profile_data(profile))

    new_file = None
    try:
        with transaction.atomic():
            profile = get_object_or_404(
                UserProfile.objects.select_for_update().select_related("user"),
                user=request.user,
            )
            serializer = UserProfileUpdateSerializer(
                profile, data=request.data, partial=True,
            )
            serializer.is_valid(raise_exception=True)
            photo = serializer.validated_data.pop("profile_picture", None)

            if photo is not None:
                old_name = profile.profile_picture.name
                old_storage = profile.profile_picture.storage
                profile.profile_picture.save(photo.name, photo, save=False)
                new_file = (profile.profile_picture.storage, profile.profile_picture.name)
                serializer.save(profile_picture=new_file[1])
                if old_name and old_name != new_file[1]:
                    transaction.on_commit(
                        lambda: _delete_unreferenced_profile_photo(old_storage, old_name)
                    )
            else:
                serializer.save()

            response = Response(_current_profile_data(profile))
    except Exception:
        if new_file is not None:
            storage, name = new_file
            try:
                storage.delete(name)
            except Exception:
                logger.exception("Could not remove profile photo %s after failed update.", name)
        raise

    return response

def _public_profile_data(profile):
    data = UserProfileSerializer(profile).data
    approved_recipes = (
        Recipe.objects.filter(user_id=profile.user_id, approved=True)
        .prefetch_related("images", "categories", "recipe_ingredients__ingredient", "reviews")
        .order_by("-date_created", "-id")
    )
    data["approved_recipes"] = RecipeSummarySerializer(approved_recipes, many=True).data
    return data


@api_view(["GET"])
def user_detail(request, username):
    profile = get_object_or_404(
        UserProfile.objects.select_related("user"), user__username=username,
    )
    return Response(_public_profile_data(profile))


@api_view(["GET"])
def user_detail_by_id(request, user_id):
    profile = get_object_or_404(
        UserProfile.objects.select_related("user"), user_id=user_id,
    )
    return Response(_public_profile_data(profile))
