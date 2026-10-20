from django.urls import path
from . import views

urlpatterns = [
    path("<int:recipe_id>/<int:review_id>/", views.review_detail),
]