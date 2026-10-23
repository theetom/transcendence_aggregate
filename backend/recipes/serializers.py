import re
from decimal import Decimal, InvalidOperation

from rest_framework import serializers
from django.db import connection, transaction
from django.core.exceptions import ObjectDoesNotExist
from .models import Recipe, RecipeIngredient, RecipeStep, Category, Ingredient, RecipeImage
from reviews.serializers import ReviewSerializer

@transaction.atomic
def get_or_create_named_record(model, name):
	name = name.strip()
	# Serialize lookup/create, including names which do not have a row to lock yet.
	with connection.cursor() as cursor:
		cursor.execute("SELECT pg_advisory_xact_lock(%s, %s)", [730017, 1])
	# Apply the same whitespace/case rules as validation, including legacy names.
	key = name.lower()
	for record in model.objects.only("name").order_by("pk").iterator():
		if record.name.strip().lower() == key:
			return record
	return model.objects.create(name=name)


def validate_unique_names(names, label):
	normalized = [name.strip().lower() for name in names]
	if len(normalized) != len(set(normalized)):
		raise serializers.ValidationError(f"{label} must be unique.")


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


class RecipeReviewStatisticsMixin:
	def to_representation(self, recipe):
		# List serializers reuse the same child; keep each response snapshot local.
		self._review_statistics = None
		return super().to_representation(recipe)

	def _get_review_statistics(self, recipe):
		cached = getattr(self, "_review_statistics", None)
		if cached is None or cached[0] is not recipe:
			# Both fields use one materialized snapshot, even if reviews change later.
			reviews = list(recipe.reviews.all())
			count = len(reviews)
			average = sum(review.grade for review in reviews) / count if count else 0.0
			cached = (recipe, average, count)
			self._review_statistics = cached
		return cached[1], cached[2]

	def get_average_score(self, recipe):
		return self._get_review_statistics(recipe)[0]

	def get_number_of_reviews(self, recipe):
		return self._get_review_statistics(recipe)[1]


class RecipeDetailedSerializer(RecipeReviewStatisticsMixin, serializers.ModelSerializer):
	content_revision = serializers.IntegerField(read_only=True)
	user = serializers.PrimaryKeyRelatedField(read_only=True)
	author = serializers.SerializerMethodField()
	approved = serializers.BooleanField(read_only=True)
	rejected = serializers.BooleanField(read_only=True)
	rejection_reason = serializers.CharField(read_only=True)
	deletion_requested = serializers.BooleanField(read_only=True)

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
			"deletion_requested",
			"content_revision",
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

	def validate_ingredients(self, ingredients):
		validate_unique_names(
			[item["ingredient"]["name"] for item in ingredients], "Ingredients"
		)
		return ingredients

	def validate_categories(self, categories):
		validate_unique_names([category["name"] for category in categories], "Categories")
		return categories

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
			category_object = get_or_create_named_record(Category, category_name)
			recipe.categories.add(category_object)

		for item in ingredient_data:
			ingredient = item.pop("ingredient")
			ingredient_name = ingredient.get("name")
			ingredient_object = get_or_create_named_record(Ingredient, ingredient_name)
			RecipeIngredient.objects.create(
				recipe=recipe,
				ingredient=ingredient_object,
				**item,
			)

		RecipeStep.objects.bulk_create(
			[RecipeStep(recipe=recipe, **step) for step in step_data]
		)

		return recipe


class RecipeDecisionSerializer(serializers.Serializer):
	content_revision = serializers.IntegerField(min_value=1)


class RecipeRejectionSerializer(RecipeDecisionSerializer):
	reason = serializers.CharField(
		required=True,
		allow_blank=False,
		trim_whitespace=True,
		max_length=1000,
	)


class RecipeUpdateSerializer(serializers.ModelSerializer):
	resubmit = serializers.BooleanField(write_only=True, required=False)
	ingredients = RecipeUpdateIngredientSerializer(many=True, required=False, allow_empty=False)
	categories = RecipeUpdateCategorySerializer(many=True, required=False)
	steps = RecipeStepSerializer(many=True, required=False, allow_empty=False)

	class Meta:
		model = Recipe
		fields = ["title", "description", "ingredients", "categories", "steps", "resubmit"]
		extra_kwargs = {"title": {"required": False}, "description": {"required": False}}

	def validate_ingredients(self, ingredients):
		validate_unique_names([ingredient["name"] for ingredient in ingredients], "Ingredients")
		return ingredients

	def validate_categories(self, categories):
		validate_unique_names([category["name"] for category in categories], "Categories")
		return categories

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

	def update(self, instance, validated_data):
		ingredients = validated_data.pop("ingredients", None)
		categories = validated_data.pop("categories", None)
		steps = validated_data.pop("steps", None)
		for field, value in validated_data.items():
			setattr(instance, field, value)
		if validated_data:
			instance.save(update_fields=list(validated_data))

		if categories is not None:
			category_objects = [
				get_or_create_named_record(Category, category["name"])
				for category in categories
			]
			instance.categories.set(category_objects)

		if ingredients is not None:
			instance.recipe_ingredients.all().delete()
			for ingredient_data in ingredients:
				ingredient = get_or_create_named_record(Ingredient, ingredient_data["name"])
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

		return instance


class RecipeSummarySerializer(RecipeReviewStatisticsMixin, serializers.ModelSerializer):
	content_revision = serializers.IntegerField(read_only=True)
	approved = serializers.BooleanField(read_only=True)
	rejected = serializers.BooleanField(read_only=True)
	rejection_reason = serializers.CharField(read_only=True)
	deletion_requested = serializers.BooleanField(read_only=True)
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
			"deletion_requested",
			"content_revision",
			"ingredients",
			"categories",
			"images",
			"average_score",
			"number_of_reviews",
		]

	# Preserve the last-30-days annotations supplied by the ranking views.
	def get_average_score(self, recipe):
		if hasattr(recipe, "recent_average_score"):
			return recipe.recent_average_score or 0.0
		return super().get_average_score(recipe)

	def get_number_of_reviews(self, recipe):
		if hasattr(recipe, "recent_number_of_reviews"):
			return recipe.recent_number_of_reviews
		return super().get_number_of_reviews(recipe)

