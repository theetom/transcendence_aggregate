from django.urls import path

from .views import CategoriesView, IngredientsView, OwnRecipesView, RecipesView, RecipeView


app_name = 'public_api'

urlpatterns = [
    path('recipes/', RecipesView.as_view(), name='recipes'),
    path('recipes/<int:recipe_id>/', RecipeView.as_view(), name='recipe'),
    path('categories/', CategoriesView.as_view(), name='categories'),
    path('ingredients/', IngredientsView.as_view(), name='ingredients'),
    path('me/recipes/', OwnRecipesView.as_view(), name='own-recipes'),
]
