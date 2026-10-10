from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase


User = get_user_model()


class WebsiteLoginTests(APITestCase):
    password = "KitchenLogin-84!secure"

    def setUp(self):
        self.user = User.objects.create_user(
            username="cook",
            email="Cook@example.com",
            password=self.password,
        )

    def login(self, identifier, password=None):
        return self.client.post(
            "/api/login/",
            {
                "username": identifier,
                "password": self.password if password is None else password,
            },
            format="json",
        )

    def assert_login_rejected(self, response):
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data.get("non_field_errors"),
            ["Unable to log in with provided credentials."],
        )

    def test_username_login_returns_the_accounts_token(self):
        response = self.login("cook")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.data), {"token"})
        self.assertEqual(Token.objects.get(key=response.data["token"]).user, self.user)

    def test_email_login_ignores_case_and_surrounding_whitespace(self):
        for identifier in ("Cook@example.com", "COOK@EXAMPLE.COM", "  cook@example.com  "):
            with self.subTest(identifier=identifier):
                response = self.login(identifier)

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(Token.objects.get(key=response.data["token"]).user, self.user)

        self.assertEqual(Token.objects.filter(user=self.user).count(), 1)

    def test_username_matching_remains_case_sensitive(self):
        self.assert_login_rejected(self.login("COOK"))

    def test_wrong_password_is_rejected_for_both_identifiers(self):
        for identifier in ("cook", "Cook@example.com"):
            with self.subTest(identifier=identifier):
                self.assert_login_rejected(self.login(identifier, password="wrong-password"))

        self.assertFalse(Token.objects.filter(user=self.user).exists())

    def test_unknown_identifiers_use_the_same_credential_error(self):
        for identifier in ("missing-user", "missing@example.com"):
            with self.subTest(identifier=identifier):
                self.assert_login_rejected(self.login(identifier))

    def test_inactive_account_cannot_log_in_with_either_identifier(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        for identifier in ("cook", "Cook@example.com"):
            with self.subTest(identifier=identifier):
                self.assert_login_rejected(self.login(identifier))

        self.assertFalse(Token.objects.filter(user=self.user).exists())

    def test_duplicate_email_is_rejected_without_choosing_an_account(self):
        User.objects.create_user(
            username="other-cook",
            email="cook@EXAMPLE.COM",
            password=self.password,
        )

        self.assert_login_rejected(self.login("Cook@example.com"))
        self.assertEqual(Token.objects.count(), 0)

    def test_email_and_another_accounts_username_are_rejected_as_ambiguous(self):
        User.objects.create_user(
            username="Cook@example.com",
            email="other@example.com",
            password=self.password,
        )

        self.assert_login_rejected(self.login("Cook@example.com"))
        self.assertEqual(Token.objects.count(), 0)

    def test_signup_rejects_case_variant_of_an_existing_email(self):
        response = self.client.post(
            "/api/sign_up/",
            {
                "username": "new-cook",
                "email": "COOK@EXAMPLE.COM",
                "password": self.password,
                "password_confirm": self.password,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        self.assertFalse(User.objects.filter(username="new-cook").exists())

    def test_email_login_keeps_logout_and_fresh_username_login_working(self):
        login_response = self.login("Cook@example.com")
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        old_token = login_response.data["token"]

        logout_response = self.client.post(
            "/api/logout/",
            HTTP_AUTHORIZATION=f"Token {old_token}",
        )
        self.assertEqual(logout_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Token.objects.filter(key=old_token).exists())

        profile_response = self.client.get(
            "/api/me/",
            HTTP_AUTHORIZATION=f"Token {old_token}",
        )
        self.assertEqual(profile_response.status_code, status.HTTP_401_UNAUTHORIZED)

        fresh_login_response = self.login("cook")
        self.assertEqual(fresh_login_response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(fresh_login_response.data["token"], old_token)
