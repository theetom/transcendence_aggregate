from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework import status

from recipes.models import Recipe
from .models import Review
# from recipes.serializers import RecipeSerializer
from reviews.serializers import ReviewSerializer, can_delete_review


def _delete_review(request, recipe_id, review_id):
    if not request.user.is_authenticated:
        return Response(
            {"error": "You must be logged in to delete a review."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # Use the same recipe lock as recipe editing, review creation and deletion.
    with transaction.atomic():
        recipe = get_object_or_404(Recipe.objects.select_for_update(), pk=recipe_id)
        reviews = Review.objects.select_for_update().select_related("user", "recipe")
        if not request.user.is_staff and recipe.user_id != request.user.id:
            # Review authors may remove only their own review on another recipe.
            reviews = reviews.filter(user_id=request.user.id)
        review = get_object_or_404(reviews, pk=review_id, recipe=recipe)
        if not can_delete_review(request.user, review):
            return Response(
                {"error": "Only staff can delete a review written by staff."},
                status=status.HTTP_403_FORBIDDEN,
            )

        review.delete()

    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "DELETE"])
def review_detail(request, recipe_id, review_id):
    if request.method == "DELETE":
        return _delete_review(request, recipe_id, review_id)

    try:
        recipe = Recipe.objects.get(pk=recipe_id)
    except Recipe.DoesNotExist:
        return Response(
            {"error": "Recipe not found"},
            status=status.HTTP_404_NOT_FOUND
        )

    if (
        not recipe.approved
        and not request.user.is_staff
        and recipe.user_id != request.user.id
    ):
        return Response(
            {"error": "This recipe has not been approved."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        review = Review.objects.get(
            id=review_id,
            recipe=recipe
        )
    except Review.DoesNotExist:
        return Response(
            {"error": "Review not found"},
            status=status.HTTP_404_NOT_FOUND
        )

    serializer = ReviewSerializer(review, context={"review_viewer": request.user})

    return Response(serializer.data)
