from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

from .models import UserProfile


User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
	class Meta:
		model = User
		fields = "__all__"

class UserProfileSerializer(serializers.ModelSerializer):
	user = UserSerializer()

	class Meta:
		model = UserProfile
		fields = "__all__"


class SignupSerializer(serializers.Serializer):
	username = serializers.CharField(max_length=150)
	email = serializers.EmailField(required=False, allow_blank=True)
	password = serializers.CharField(write_only=True, min_length=8)
	password_confirm = serializers.CharField(write_only=True)

	def validate_username(self, value):
		if User.objects.filter(username=value).exists():
			raise serializers.ValidationError("A user with this username already exists.")
		return value

	def validate_email(self, value):
		if User.objects.filter(email=value).exists():
			raise serializers.ValidationError("A user with this email adress already exists.")
		return value

	def validate(self, attrs):
		if attrs["password"] != attrs["password_confirm"]:
			raise serializers.ValidationError(
				{"password_confirm": "Passwords do not match."}
			)
		validate_password(attrs["password"])
		return attrs
