import logging

from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection, transaction
from django.db.models import Q

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
from reviews.models import Review
from reviews.serializers import ReviewSerializer


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
    username = None
    email = None

    try:
        with transaction.atomic():
            # Keep duplicate checks and creation together across signup workers.
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(%s, %s)", [730017, 2])
            serializer.is_valid(raise_exception=True)
            username = User.normalize_username(serializer.validated_data["username"])
            email = serializer.validated_data["email"]

            # create_user applies this normalization before storing the username.
            if username != serializer.validated_data["username"] and User.objects.filter(username=username).exists():
                return Response(
                    {"username": ["A user with this username already exists."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user = User.objects.create_user(
                username=username,
                email=email,
                password=serializer.validated_data["password"],
            )
            UserProfile.objects.create(user=user)
            token = Token.objects.create(user=user)
    except IntegrityError:
        # Query only after rollback; do not mask unrelated database failures.
        if username is None:
            raise
        conflicts = {}
        if User.objects.filter(username=username).exists():
            conflicts["username"] = ["A user with this username already exists."]
        if User.objects.filter(email__iexact=email).exists():
            conflicts["email"] = ["A user with this email already exists."]
        if not conflicts:
            raise
        return Response(conflicts, status=status.HTTP_400_BAD_REQUEST)

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
    authored_reviews = (
        Review.objects.filter(user_id=profile.user_id)
        .select_related("user", "recipe")
        .order_by("-timestamp", "-id")
    )
    if not profile.user.is_staff:
        authored_reviews = authored_reviews.filter(
            Q(recipe__approved=True) | Q(recipe__user_id=profile.user_id)
        )
    data["authored_reviews"] = [
        {
            **ReviewSerializer(review).data,
            "recipe": {"id": review.recipe_id, "title": review.recipe.title},
        }
        for review in authored_reviews
    ]
    return data


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def user_favorite(request, recipe_id):
    with transaction.atomic():
        # Keep the approval check consistent with recipe edits and deletion.
        recipe = get_object_or_404(Recipe.objects.select_for_update(), pk=recipe_id)
        if request.method == "PUT" and not recipe.approved:
            return Response(
                {"error": "Only approved recipes can be added to favorites."},
                status=status.HTTP_403_FORBIDDEN,
            )
        profile = get_object_or_404(
            UserProfile.objects.select_for_update(), user=request.user,
        )
        if request.method == "PUT":
            profile.favorites.add(recipe)
        else:
            profile.favorites.remove(recipe)
        favorites = list(profile.favorites.order_by("pk").values_list("pk", flat=True))
        return Response({
            "user_id": profile.user_id,
            "recipe_id": recipe.id,
            "is_favorite": recipe.id in favorites,
            "favorites": favorites,
        })


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
        profile = get_object_or_404(
            UserProfile.objects.select_related("user"), user=request.user,
        )
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
