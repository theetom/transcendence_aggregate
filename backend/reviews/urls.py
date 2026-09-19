from django.urls import path
from . import views

urlpatterns = [
    path("<str:recipe_name>/<int:review_id>/", views.review_detail),
]