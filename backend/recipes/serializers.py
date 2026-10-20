import re
from decimal import Decimal, InvalidOperation

from rest_framework import serializers
from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist
from .models import Recipe, RecipeIngredient, RecipeStep, Category, Ingredient, RecipeImage
from reviews.serializers import ReviewSerializer

def validate_positive_quantity(value):
	message = "Enter a number greater than zero."
	if not re.fullmatch(r"[0-9]*\.?[0-9]*", value):
		raise serializers.ValidationError(message)
	try:
		quantity = Decimal(value)
	except InvalidOperation:
		raise serializers.ValidationError(message)
	if not quantity.is_finite() or quantity <= 0:
		raise serializers.ValidationError(message)
	return value


class RecipeIngredientSerializer(serializers.ModelSerializer):
	name = serializers.CharField(source="ingredient.name")
	quantity = serializers.CharField(max_length=50, validators=[validate_positive_quantity])

	def validate(self, attrs):
		if "quantity" not in attrs:
			raise serializers.ValidationError({"quantity": ["This field is required."]})
		return attrs

	class Meta:
		model = RecipeIngredient
		fields = ["name", "quantity", "unit"]


class RecipeIngredientNameSerializer(serializers.ModelSerializer):
	name = serializers.CharField(source="ingredient.name")

	class Meta:
		model = RecipeIngredient
		fields = ["name"]


class RecipeStepSerializer(serializers.ModelSerializer):
	class Meta:
		model = RecipeStep
		fields = ["step_number", "instruction"]


class RecipeUpdateIngredientSerializer(serializers.Serializer):
	name = serializers.CharField(max_length=100)
	quantity = serializers.CharField(max_length=50, validators=[validate_positive_quantity])
	unit = serializers.CharField(max_length=50)

	def validate(self, attrs):
		if "quantity" not in attrs:
			raise serializers.ValidationError({"quantity": ["This field is required."]})
		return attrs


class RecipeUpdateCategorySerializer(serializers.Serializer):
	name = serializers.CharField(max_length=100)


class CategorySerializer(serializers.ModelSerializer):
	class Meta:
		model = Category
		fields = ["id", "name"]

class IngredientSerializer(serializers.ModelSerializer):
	class Meta:
		model = Ingredient
		fields = ["id", "name"]

class RecipeImageSerializer(serializers.ModelSerializer):
	class Meta:
		model = RecipeImage
		fields = ["id", "image"]


class RecipeDetailedSerializer(serializers.ModelSerializer):
	user = serializers.PrimaryKeyRelatedField(read_only=True)
	author = serializers.SerializerMethodField()
	approved = serializers.BooleanField(read_only=True)
	rejected = serializers.BooleanField(read_only=True)
	rejection_reason = serializers.CharField(read_only=True)

	ingredients = RecipeIngredientSerializer(
		source="recipe_ingredients",
		many=True
	)

	categories = CategorySerializer(
		many=True
	)
	steps = RecipeStepSerializer(
		many=True,
		allow_empty=False
	)
	reviews = ReviewSerializer(
		many=True,
		read_only=True
	)
	images = RecipeImageSerializer(many=True, read_only=True)
	average_score = serializers.SerializerMethodField()
	number_of_reviews = serializers.SerializerMethodField()

	class Meta:
		model = Recipe
		fields = [
			"id",
			"title",
			"approved",
			"rejected",
			"rejection_reason",
			"description",
			"date_created",
			"user",
			"author",
			"ingredients",
			"steps",
			"categories",
			"reviews",
			"images",
			"average_score",
			"number_of_reviews",
		]

	def get_author(self, recipe):
		user = recipe.user
		try:
			profile = user.profile
		except ObjectDoesNotExist:
			profile = None
		photo = profile.profile_picture if profile is not None else None
		other_recipes = (
			Recipe.objects.filter(user_id=recipe.user_id, approved=True)
			.exclude(pk=recipe.pk)
			.order_by("-date_created", "-id")
			.prefetch_related("images", "categories", "recipe_ingredients__ingredient", "reviews")
		)
		return {
			"id": user.id,
			"username": user.username,
			"name": user.get_full_name().strip() or user.username,
			"email": user.email,
			"bio": profile.bio if profile is not None else "",
			"profile_picture": photo.url if photo else None,
			"approved_recipes": RecipeSummarySerializer(other_recipes, many=True, context=self.context).data,
		}

	#  for all reviews
	def get_average_score(self, recipe):
		reviews = recipe.reviews.all()
		if not reviews.exists():
			return 0.0
		return sum(review.grade for review in reviews) / reviews.count()

	def get_number_of_reviews(self, recipe):
		return recipe.reviews.count()

	def validate_steps(self, steps):
		step_numbers = [step["step_number"] for step in steps]
		if any(number < 1 for number in step_numbers):
			raise serializers.ValidationError(
				"Step numbers must be greater than zero."
			)
		if len(step_numbers) != len(set(step_numbers)):
			raise serializers.ValidationError(
				"Step numbers must be unique."
			)
		return steps

	@transaction.atomic
	def create(self, validated_data):
		ingredient_data = validated_data.pop("recipe_ingredients", [])
		category_data = validated_data.pop("categories", [])
		step_data = validated_data.pop("steps")
		validated_data.pop("reviews", [])

		recipe = Recipe.objects.create(**validated_data)

		for category in category_data:
			category_name = category.get("name") if isinstance(category, dict) else category
			category_object, _ = Category.objects.get_or_create(name=category_name)
			recipe.categories.add(category_object)

		for item in ingredient_data:
			ingredient = item.pop("ingredient")
			ingredient_name = ingredient.get("name")
			ingredient_object, _ = Ingredient.objects.get_or_create(name=ingredient_name)
			RecipeIngredient.objects.create(
				recipe=recipe,
				ingredient=ingredient_object,
				**item,
			)

		RecipeStep.objects.bulk_create(
			[RecipeStep(recipe=recipe, **step) for step in step_data]
		)

		return recipe


class RecipeRejectionSerializer(serializers.Serializer):
	reason = serializers.CharField(
		required=True,
		allow_blank=False,
		trim_whitespace=True,
		max_length=1000,
	)


class RecipeUpdateSerializer(serializers.ModelSerializer):
	ingredients = RecipeUpdateIngredientSerializer(many=True, required=False)
	categories = RecipeUpdateCategorySerializer(many=True, required=False)
	steps = RecipeStepSerializer(many=True, required=False)

	class Meta:
		model = Recipe
		fields = ["title", "description", "ingredients", "categories", "steps"]

	def validate_ingredients(self, ingredients):
		names = [ingredient["name"].lower() for ingredient in ingredients]
		if len(names) != len(set(names)):
			raise serializers.ValidationError(
				"Ingredients must be unique."
			)
		return ingredients

	def validate_steps(self, steps):
		step_numbers = [step["step_number"] for step in steps]
		if len(step_numbers) != len(set(step_numbers)):
			raise serializers.ValidationError(
				"Step numbers must be unique."
			)
		return steps

	def update(self, instance, validated_data):
		ingredients = validated_data.pop("ingredients", None)
		categories = validated_data.pop("categories", None)
		steps = validated_data.pop("steps", None)
		for field, value in validated_data.items():
			setattr(instance, field, value)
		if validated_data:
			# Do not overwrite a staff decision made during this edit.
			instance.save(update_fields=list(validated_data))

		if categories is not None:
			category_objects = [
				Category.objects.get_or_create(name=category["name"])[0]
				for category in categories
			]
			instance.categories.set(category_objects)

		if ingredients is not None:
			instance.recipe_ingredients.all().delete()
			for ingredient_data in ingredients:
				ingredient, _ = Ingredient.objects.get_or_create(
					name=ingredient_data["name"]
				)
				RecipeIngredient.objects.create(
					recipe=instance,
					ingredient=ingredient,
					quantity=ingredient_data["quantity"],
					unit=ingredient_data["unit"]
				)

		if steps is not None:
			instance.steps.all().delete()
			RecipeStep.objects.bulk_create(
				[RecipeStep(recipe=instance, **step) for step in steps]
			)

		instance.refresh_from_db(fields=["approved", "rejected", "rejection_reason"])
		return instance


class RecipeSummarySerializer(serializers.ModelSerializer):
	approved = serializers.BooleanField(read_only=True)
	rejected = serializers.BooleanField(read_only=True)
	rejection_reason = serializers.CharField(read_only=True)
	ingredients = RecipeIngredientNameSerializer(
		source="recipe_ingredients",
		many=True,
		read_only=True
	)
	categories = CategorySerializer(
		many=True,
		read_only=True
	)
	images = RecipeImageSerializer(many=True, read_only=True)
	average_score = serializers.SerializerMethodField()
	number_of_reviews = serializers.SerializerMethodField()

	class Meta:
		model = Recipe
		fields = [
			"id",
			"title",
			"approved",
			"rejected",
			"rejection_reason",
			"ingredients",
			"categories",
			"images",
			"average_score",
			"number_of_reviews",
		]

	# only for last month see views
	def get_average_score(self, recipe):
		if hasattr(recipe, "recent_average_score"):
			return recipe.recent_average_score or 0.0
		reviews = recipe.reviews.all()
		if not reviews.exists():
			return 0.0
		return sum(review.grade for review in reviews) / reviews.count()

	def get_number_of_reviews(self, recipe):
		if hasattr(recipe, "recent_number_of_reviews"):
			return recipe.recent_number_of_reviews
		return recipe.reviews.count()

