from django.db import models

from recipes.models import Recipe

class Review(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="user_reviews")
    comment = models.TextField()
    grade = models.PositiveIntegerField()
    timestamp = models.DateTimeField(auto_now_add=True)