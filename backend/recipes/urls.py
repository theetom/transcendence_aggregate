from django.urls import path
from . import views


urlpatterns = [
    path("recipes/", views.recipe_landing_page),
    path("recipes/all_recipes/", views.recipe_list),
    path("recipes/manage/", views.managed_recipes),
    path("recipes/all_recipes/pending/", views.pending_approval),
	path("recipes/add_recipe/", views.recipe_intake),
    path("recipes/<int:recipe_id>/approve/", views.recipe_approve),
    path("recipes/<int:recipe_id>/reject/", views.recipe_reject),
    path("recipes/<int:recipe_id>/deletion/reject/", views.recipe_deletion_reject),
    path("recipes/<int:recipe_id>/", views.recipe_detail),
]