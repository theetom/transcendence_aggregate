from rest_framework import serializers
from .models import Review

class ReviewSerializer(serializers.ModelSerializer):
	author = serializers.SerializerMethodField()
	comment = serializers.CharField(allow_blank=False, trim_whitespace=True)
	grade = serializers.IntegerField(min_value=1, max_value=5)

	class Meta:
		model = Review
		fields = ["id", "user", "author", "comment", "grade", "timestamp"]
		read_only_fields = ["id", "user", "timestamp"]

	def get_author(self, review):
		user = review.user
		return {
			"id": user.id,
			"username": user.username,
			"name": user.get_full_name().strip() or user.username,
		}
