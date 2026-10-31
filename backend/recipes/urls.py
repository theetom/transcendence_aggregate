from django.urls import path
from . import views
from .transfer_views import (
    RecipeDataView, RecipeExportView, RecipeValidateView, RecipeImportView, RecipeImportStatusView,
)


urlpatterns = [
    path("me/recipe-data/", RecipeDataView.as_view()),
    path("me/recipe-data/export/", RecipeExportView.as_view()),
    path("me/recipe-data/validate/", RecipeValidateView.as_view()),
    path("me/recipe-data/import/", RecipeImportView.as_view()),
    path("me/recipe-data/imports/<uuid:request_id>/", RecipeImportStatusView.as_view()),
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