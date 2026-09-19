from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from recipes.models import Recipe
from .models import Review
# from recipes.serializers import RecipeSerializer
from reviews.serializers import ReviewSerializer

@api_view(["GET"])
def review_detail(request, recipe_name, review_id):

    try:
        recipe = Recipe.objects.get(title=recipe_name)
    except Recipe.DoesNotExist:
        return Response(
            {"error": "Recipe not found"},
            status=status.HTTP_404_NOT_FOUND
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