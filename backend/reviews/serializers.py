from rest_framework import serializers
from .models import Review


def can_delete_review(user, review):
	return bool(
		user and user.is_authenticated and (
			user.is_staff
			or review.user_id == user.id
			or (review.recipe.user_id == user.id and not review.user.is_staff)
		)
	)


class ReviewSerializer(serializers.ModelSerializer):
	author = serializers.SerializerMethodField()
	can_delete = serializers.SerializerMethodField()
	comment = serializers.CharField(allow_blank=False, trim_whitespace=True)
	grade = serializers.IntegerField(min_value=1, max_value=5)

	class Meta:
		model = Review
		fields = ["id", "user", "author", "comment", "grade", "timestamp", "can_delete"]
		read_only_fields = ["id", "user", "timestamp"]

	def get_can_delete(self, review):
		return can_delete_review(self.context.get("review_viewer"), review)

	def get_author(self, review):
		user = review.user
		return {
			"id": user.id,
			"username": user.username,
			"name": user.get_full_name().strip() or user.username,
		}
