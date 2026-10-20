from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from recipes.models import Recipe
from .models import Review
# from recipes.serializers import RecipeSerializer
from reviews.serializers import ReviewSerializer

@api_view(["GET"])
def review_detail(request, recipe_id, review_id):

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

    serializer = ReviewSerializer(review)

    return Response(serializer.data)