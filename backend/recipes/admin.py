from django.contrib import admin
from .models import (
				Recipe,
				Ingredient,
				RecipeIngredient,
				RecipeStep,
				Category,
				RecipeImage,
				IngredientImage,
)

admin.site.register(Recipe)
admin.site.register(Ingredient)
admin.site.register(RecipeIngredient)
admin.site.register(RecipeStep)
admin.site.register(Category)
admin.site.register(RecipeImage)
admin.site.register(IngredientImage)
# Register your models here.
