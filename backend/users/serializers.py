from rest_framework import serializers
from rest_framework.authtoken.serializers import AuthTokenSerializer
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.contrib.auth.password_validation import validate_password

from .models import UserProfile


User = get_user_model()

class UsernameOrEmailAuthTokenSerializer(AuthTokenSerializer):
    username = serializers.CharField(label="Username or email", write_only=True)

    def validate(self, attrs):
        identifier = attrs.get("username")
        if identifier:
            matching_usernames = list(
                User.objects.filter(
                    Q(username=identifier) | Q(email__iexact=identifier)
                ).values_list("username", flat=True)[:2]
            )
            if len(matching_usernames) > 1:
                raise serializers.ValidationError(
                    "Unable to log in with provided credentials.",
                    code="authorization",
                )
            if matching_usernames:
                attrs["username"] = matching_usernames[0]

        return super().validate(attrs)

class UserSerializer(serializers.ModelSerializer):
	class Meta:
		model = User
		exclude = ["password"]

class UserProfileSerializer(serializers.ModelSerializer):
	user = UserSerializer()

	class Meta:
		model = UserProfile
		fields = "__all__"


class SignupSerializer(serializers.Serializer):
	username = serializers.CharField(max_length=150)
	email = serializers.EmailField(required=True, allow_blank=False)
	password = serializers.CharField(write_only=True, min_length=8)
	password_confirm = serializers.CharField(write_only=True)

	def validate_username(self, value):
		if User.objects.filter(username=value).exists():
			raise serializers.ValidationError("A user with this username already exists.")
		return value

	def validate_email(self, value):
		if User.objects.filter(email__iexact=value).exists():
			raise serializers.ValidationError("A user with this email adress already exists.")
		return value

	def validate(self, attrs):
		if attrs["password"] != attrs["password_confirm"]:
			raise serializers.ValidationError(
				{"password_confirm": "Passwords do not match."}
			)
		validate_password(attrs["password"])
		return attrs
