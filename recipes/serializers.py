from rest_framework import serializers
from .models import Recipe, RecipeIngredient, RecipeStep, Category, Ingredient
from reviews.serializers import ReviewSerializer

class RecipeIngredientSerializer(serializers.ModelSerializer):
	name = serializers.CharField(source="ingredient.name")

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
	quantity = serializers.CharField(max_length=50)
	unit = serializers.CharField(max_length=50)


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

class RecipeDetailedSerializer(serializers.ModelSerializer):
	ingredients = RecipeIngredientSerializer(
		source="recipe_ingredients",
		many=True
	)

	categories = CategorySerializer(
		many=True
	)
	steps = RecipeStepSerializer(
		many=True,
		read_only=True
	)
	reviews = ReviewSerializer(
		many=True
	)
	average_score = serializers.SerializerMethodField()
	number_of_reviews = serializers.SerializerMethodField()

	class Meta:
		model = Recipe
		fields = [
			"id",
			"title",
			"description",
			"date_created",
			"user",
			"ingredients",
			"steps",
			"categories",
			"reviews",
			"average_score",
			"number_of_reviews",
		]

	#  for all reviews
	def get_average_score(self, recipe):
		reviews = recipe.reviews.all()
		if not reviews.exists():
			return 0.0
		return sum(review.grade for review in reviews) / reviews.count()

	def get_number_of_reviews(self, recipe):
		return recipe.reviews.count()


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
		instance = super().update(instance, validated_data)

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

		return instance


class RecipeSummarySerializer(serializers.ModelSerializer):
	ingredients = RecipeIngredientNameSerializer(
		source="recipe_ingredients",
		many=True,
		read_only=True
	)
	categories = CategorySerializer(
		many=True,
		read_only=True
	)
	average_score = serializers.SerializerMethodField()
	number_of_reviews = serializers.SerializerMethodField()

	class Meta:
		model = Recipe
		fields = [
			"id",
			"title",
			"ingredients",
			"categories",
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

