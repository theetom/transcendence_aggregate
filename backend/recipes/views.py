import json
import logging
from datetime import timedelta
from uuid import uuid4

from django.db import transaction
from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework import serializers, status

from .models import Recipe, Category, Ingredient, RecipeImage
from .serializers import RecipeSummarySerializer, RecipeDetailedSerializer, RecipeUpdateSerializer, RecipeRejectionSerializer, CategorySerializer, IngredientSerializer
from reviews.serializers import ReviewSerializer

logger = logging.getLogger(__name__)

@api_view(["GET", "POST"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def recipe_intake(request):
	if request.method == "GET":
		categories = Category.objects.all()
		ingredients = Ingredient.objects.all()

		return Response({
			"categories" : CategorySerializer(categories, many=True).data,
			"ingredients" : IngredientSerializer(ingredients, many=True).data,
		})
	
	if request.method == "POST":
		if not request.user.is_authenticated:
			return Response(
				{"error": "You must be logged in to add a recipe."},
				status=status.HTTP_401_UNAUTHORIZED,
			)

		raw_data = request.data
		if not isinstance(raw_data, dict):
			return Response(
				{"non_field_errors": ["Recipe data must be an object."]},
				status=status.HTTP_400_BAD_REQUEST,
			)

		image_files = request.FILES.getlist("images")
		if not image_files:
			return Response(
				{"images": "Add at least one photo before submitting."},
				status=status.HTTP_400_BAD_REQUEST,
			)
		if sum(image_file.size for image_file in image_files) > 20 * 1024 * 1024:
			return Response(
				{"images": "Photos must total 20 MiB or smaller."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		image_field = serializers.ImageField(allow_empty_file=False)
		image_extensions = {
			"JPEG": ".jpg", "PNG": ".png", "GIF": ".gif",
			"WEBP": ".webp",
		}
		for index, image_file in enumerate(image_files, start=1):
			if image_file.size > 5 * 1024 * 1024:
				return Response(
					{"images": f"Photo {index} must be 5 MiB or smaller."},
					status=status.HTTP_400_BAD_REQUEST,
				)
			try:
				image_field.run_validation(image_file)
			except serializers.ValidationError as error:
				return Response(
					{"images": {str(index): error.detail}},
					status=status.HTTP_400_BAD_REQUEST,
				)
			extension = image_extensions.get(image_file.image.format)
			if extension is None:
				return Response(
					{"images": f"Photo {index} must be JPEG, PNG, GIF or WebP."},
					status=status.HTTP_400_BAD_REQUEST,
				)
			# Match the served extension to verified bytes, not the original filename.
			image_file.name = f"{uuid4().hex}{extension}"
			image_file.seek(0)

		# Keep uploaded files separate and give nested serializers a plain dict.
		data = {
			key: raw_data.get(key)
			for key in raw_data
			if key not in request.FILES
		}
		for field in ("ingredients", "categories", "steps"):
			if field in data and isinstance(data[field], str):
				try:
					data[field] = json.loads(data[field])
				except json.JSONDecodeError:
					return Response(
						{field: "This field must contain a valid JSON array."},
						status=status.HTTP_400_BAD_REQUEST,
					)

		serializer = RecipeDetailedSerializer(data=data)
		if not serializer.is_valid():
			return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

		created_files = []
		try:
			with transaction.atomic():
				recipe = serializer.save(user=request.user)
				for image_file in image_files:
					photo = RecipeImage(recipe=recipe)
					photo.image.save(image_file.name, image_file, save=False)
					created_files.append((photo.image.storage, photo.image.name))
					photo.save()

				# Serialize before committing so a response-data failure rolls back.
				response = Response(serializer.data, status=status.HTTP_201_CREATED)
		except Exception:
			for storage, name in created_files:
				try:
					storage.delete(name)
				except Exception:
					logger.exception("Could not remove recipe photo %s after failed creation.", name)
			raise

		return response

@api_view(["GET"])
def recipe_list(request):

	# GET /api/recipes/
	recipes = Recipe.objects.filter(approved=True)

	serializer = RecipeSummarySerializer(
		recipes,
		many=True
	)

	return Response(serializer.data)


@api_view(["GET"])
def pending_approval(request):
	if not request.user.is_staff:
		return Response(
			{"error": "You do not have permission to approve recipes."},
			status=status.HTTP_403_FORBIDDEN
		)
	recipes = Recipe.objects.filter(approved=False, rejected=False)

	serializer = RecipeSummarySerializer(
		recipes,
		many=True
	)

	return Response(serializer.data)
	

@api_view(["POST"])
def recipe_approve(request, recipe_id):
	if not request.user.is_staff:
		return Response(
			{"error": "You do not have permission to approve recipes."},
			status=status.HTTP_403_FORBIDDEN
		)

	with transaction.atomic():
		try:
			recipe = Recipe.objects.select_for_update().get(pk=recipe_id)
		except Recipe.DoesNotExist:
			return Response(
				{"error": "Recipe not found"},
				status=status.HTTP_404_NOT_FOUND
			)

		if recipe.rejected:
			return Response(
				{"error": "This recipe has already been rejected. Reload to see its current status."},
				status=status.HTTP_409_CONFLICT,
			)

		if not recipe.approved:
			recipe.approved = True
			recipe.save(update_fields=["approved"])

		return Response(RecipeSummarySerializer(recipe).data)


@api_view(["POST"])
def recipe_reject(request, recipe_id):
	if not request.user.is_staff:
		return Response(
			{"error": "You do not have permission to reject recipes."},
			status=status.HTTP_403_FORBIDDEN,
		)

	serializer = RecipeRejectionSerializer(data=request.data)
	if not serializer.is_valid():
		return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

	with transaction.atomic():
		try:
			recipe = Recipe.objects.select_for_update().get(pk=recipe_id)
		except Recipe.DoesNotExist:
			return Response(
				{"error": "Recipe not found"},
				status=status.HTTP_404_NOT_FOUND,
			)

		if recipe.approved or recipe.rejected:
			return Response(
				{"error": "This recipe has already been reviewed. Reload to see its current status."},
				status=status.HTTP_409_CONFLICT,
			)

		recipe.rejected = True
		recipe.rejection_reason = serializer.validated_data["reason"]
		recipe.save(update_fields=["rejected", "rejection_reason"])

		return Response(RecipeSummarySerializer(recipe).data)
	

@api_view(["GET"])
def recipe_landing_page(request):
	cutoff = timezone.now() - timedelta(days=30)
	recent_reviews = Q(reviews__timestamp__gte=cutoff)
	recipes = Recipe.objects.filter(approved=True).annotate(
		recent_average_score=Avg("reviews__grade", filter=recent_reviews),
		recent_number_of_reviews=Count("reviews", filter=recent_reviews),
	)
	reviewed_recipes = recipes.filter(recent_number_of_reviews__gt=0)

	best_average = reviewed_recipes.order_by(
		"-recent_average_score", "-recent_number_of_reviews", "id"
	)[:5]
	most_reviews = reviewed_recipes.order_by(
		"-recent_number_of_reviews", "-recent_average_score", "id"
	)[:5]
	recently_added = Recipe.objects.filter(approved=True).order_by(
		"-date_created", "-id"
	)[:5]

	return Response({
		"best_average": RecipeSummarySerializer(best_average, many=True).data,
		"most_reviews": RecipeSummarySerializer(most_reviews, many=True).data,
		"recently_added": RecipeSummarySerializer(recently_added, many=True).data,
	})

@api_view(["GET", "POST", "PUT"])
def recipe_detail(request, recipe_id):

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
			status=status.HTTP_403_FORBIDDEN
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
