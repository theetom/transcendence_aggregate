from urllib import request
from datetime import timedelta

from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .models import Recipe, Category, Ingredient
from .serializers import RecipeSummarySerializer, RecipeDetailedSerializer, RecipeUpdateSerializer, CategorySerializer, IngredientSerializer
from reviews.serializers import ReviewSerializer

@api_view(["GET", "POST"])
def recipe_intake(request):
	if request.method == "GET":
		categories = Category.objects.all()
		ingredients = Ingredient.objects.all()

		return Response({
			"categories" : CategorySerializer(categories, many=True).data,
			"ingredients" : IngredientSerializer(ingredients, many=True).data,
		})
	
	if request.method == "POST":

		serializer = RecipeDetailedSerializer(
			data=request.data
		)

		if serializer.is_valid():

			serializer.save()

			return Response(
				serializer.data,
				status=status.HTTP_201_CREATED
			)

		return Response(
			serializer.errors,
			status=status.HTTP_400_BAD_REQUEST
		)

@api_view(["GET"])
def recipe_list(request):

	# GET /api/recipes/
	if request.method == "GET":
		recipes = Recipe.objects.all()

		serializer = RecipeSummarySerializer(
			recipes,
			many=True
		)

		return Response(serializer.data)

@api_view(["GET"])
def recipe_landing_page(request):
	cutoff = timezone.now() - timedelta(days=30)
	recent_reviews = Q(reviews__timestamp__gte=cutoff)
	recipes = Recipe.objects.filter(
		recent_reviews
	).annotate(
		recent_average_score=Avg("reviews__grade", filter=recent_reviews),
		recent_number_of_reviews=Count("reviews", filter=recent_reviews),
	)

	best_average = recipes.order_by(
		"-recent_average_score", "-recent_number_of_reviews", "id"
	)[:5]
	best_average_ids = best_average.values_list("id", flat=True)
	most_reviews = recipes.exclude(id__in=best_average_ids).order_by(
		"-recent_number_of_reviews", "-recent_average_score", "id"
	)[:5]

	return Response({
		"best_average": RecipeSummarySerializer(best_average, many=True).data,
		"most_reviews": RecipeSummarySerializer(most_reviews, many=True).data,
	})

@api_view(["GET", "POST", "PUT"])
def recipe_detail(request, recipe_name):

	try:
		recipe = Recipe.objects.get(title=recipe_name)
	except Recipe.DoesNotExist:
		return Response(
			{"error": "Recipe not found"},
			status=status.HTTP_404_NOT_FOUND
		)

	if request.method == "GET":
		serializer = RecipeDetailedSerializer(recipe)
		return Response(serializer.data)

	if request.method == "PUT":
		if not request.user.is_authenticated:
			return Response(
				{"error": "You must be logged in to edit a recipe."},
				status=status.HTTP_401_UNAUTHORIZED
			)

		if not request.user.is_staff and recipe.user_id != request.user.id:
			return Response(
				{"error": "You do not have permission to edit this recipe."},
				status=status.HTTP_403_FORBIDDEN
			)

		serializer = RecipeUpdateSerializer(
			recipe,
			data=request.data,
			partial=True
		)

		if serializer.is_valid():
			serializer.save()
			return Response(RecipeDetailedSerializer(recipe).data)

		return Response(
			serializer.errors,
			status=status.HTTP_400_BAD_REQUEST
		)

	if request.method == "POST":
		if not request.user.is_authenticated:
			return Response(
				{"error": "You must be logged in to write a review."},
				status=status.HTTP_401_UNAUTHORIZED
			)
		serializer = ReviewSerializer(data=request.data)

		if serializer.is_valid():
			serializer.save(
				recipe=recipe,
				user=request.user
			)
			return Response(
				serializer.data,
				status=status.HTTP_201_CREATED
			)
		return Response(
			serializer.errors,
			status=status.HTTP_400_BAD_REQUEST
		)

""" import json

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.models import User

from .models import (
	Recipe,
    Category,
    Ingredient,
    RecipeIngredient,
    RecipeStep,
)


@api_view(["GET"])
def home(request):
    return Response({
        "message": "Recipe API is working!"
    })

@csrf_exempt
def create_recipe(request):

    if request.method != "POST":
        return JsonResponse(
            {"error": "Only POST allowed"},
            status=405
        )

    data = json.loads(request.body)

    user, created = User.objects.get_or_create(
        username="test_user"
    )

    recipe = Recipe.objects.create(
        title=data["title"],
        description=data.get("description", ""),
        user=user,
    )

    for category_name in data.get("categories", []):
        category, created = Category.objects.get_or_create(
            name=category_name
        )

        recipe.categories.add(category)

    for item in data.get("ingredients", []):
        ingredient, created = Ingredient.objects.get_or_create(
            name=item["name"]
        )

        RecipeIngredient.objects.create(
            recipe=recipe,
            ingredient=ingredient,
            quantity=item["quantity"],
            unit=item["unit"],
        )

    for step in data.get("steps", []):
        RecipeStep.objects.create(
            recipe=recipe,
            step_number=step["step_number"],
            instruction=step["instruction"],
        )

    return JsonResponse({
        "message": "Recipe created successfully",
        "recipe_id": recipe.id
    }, status=201) """