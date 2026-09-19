from django.urls import path
from . import views


urlpatterns = [
    path("recipes/", views.recipe_landing_page),
    path("recipes/all_recipes/", views.recipe_list),
	path("recipes/add_recipe/", views.recipe_intake),
    path("recipes/<str:recipe_name>/", views.recipe_detail),
]