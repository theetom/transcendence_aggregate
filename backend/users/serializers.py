from collections.abc import Mapping
from uuid import uuid4

from rest_framework import serializers
from rest_framework.authtoken.serializers import AuthTokenSerializer
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
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
		fields = ["id", "username", "first_name", "last_name", "email"]
		read_only_fields = fields


class UserProfileSerializer(serializers.ModelSerializer):
	user = UserSerializer(read_only=True)

	class Meta:
		model = UserProfile
		fields = ["id", "user", "bio", "profile_picture"]
		read_only_fields = fields


class CurrentUserSerializer(UserSerializer):
	class Meta(UserSerializer.Meta):
		fields = UserSerializer.Meta.fields + ["is_staff", "date_joined"]
		read_only_fields = fields


class CurrentUserProfileSerializer(UserProfileSerializer):
	user = CurrentUserSerializer(read_only=True)

	class Meta(UserProfileSerializer.Meta):
		fields = UserProfileSerializer.Meta.fields + ["favorites"]
		read_only_fields = fields


class ProfilePictureField(serializers.ImageField):
    def to_internal_value(self, data):
        if getattr(data, "size", 0) > 5 * 1024 * 1024:
            raise serializers.ValidationError("Profile photo must be 5 MiB or smaller.")

        image_file = super().to_internal_value(data)
        extensions = {
            "JPEG": ".jpg", "PNG": ".png", "GIF": ".gif", "WEBP": ".webp",
        }
        extension = extensions.get(image_file.image.format)
        if extension is None:
            raise serializers.ValidationError("Choose a JPEG, PNG, GIF or WebP photo.")
        image_file.name = f"{uuid4().hex}{extension}"
        image_file.seek(0)
        return image_file


class UserProfileUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(
        source="user.first_name", max_length=150, required=False, allow_blank=True,
    )
    last_name = serializers.CharField(
        source="user.last_name", max_length=150, required=False, allow_blank=True,
    )
    bio = serializers.CharField(required=False, allow_blank=True)
    profile_picture = ProfilePictureField(required=False, allow_empty_file=False)

    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            unsupported = set(data) - set(self.fields)
            if unsupported:
                raise serializers.ValidationError({
                    field: ["This field cannot be edited."]
                    for field in sorted(unsupported)
                })
        return super().to_internal_value(data)

    def update(self, instance, validated_data):
        # The caller groups both model updates in one transaction.
        user_data = validated_data.pop("user", {})
        if user_data:
            user = instance.user
            for field, value in user_data.items():
                setattr(user, field, value)
            user.save(update_fields=list(user_data))

        for field, value in validated_data.items():
            setattr(instance, field, value)
        if validated_data:
            instance.save(update_fields=list(validated_data))
        return instance


class SignupSerializer(serializers.Serializer):
	username = serializers.CharField(max_length=150)
	email = serializers.EmailField(required=True, allow_blank=False)
	password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)
	password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)

	def validate_username(self, value):
		if User.objects.filter(username=value).exists():
			raise serializers.ValidationError("A user with this username already exists.")
		return value

	def validate_email(self, value):
		if User.objects.filter(email__iexact=value).exists():
			raise serializers.ValidationError("A user with this email adress already exists.")
		return value

	def validate(self, attrs):
		if not attrs["password"].strip():
			raise serializers.ValidationError({"password": "Enter a password."})
		if attrs["password"] != attrs["password_confirm"]:
			raise serializers.ValidationError(
				{"password_confirm": "Passwords do not match."}
			)
		candidate_user = User(username=attrs["username"], email=attrs["email"])
		try:
			validate_password(attrs["password"], user=candidate_user)
		except DjangoValidationError as error:
			raise serializers.ValidationError({"password": error.messages}) from error
		return attrs
