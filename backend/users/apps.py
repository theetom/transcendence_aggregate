from django.apps import AppConfig


class UsersConfig(AppConfig):
    name = 'users'

    def ready(self):
        from django.contrib.auth.signals import user_logged_in

        # Last-login tracking is not part of this application's account data.
        user_logged_in.disconnect(dispatch_uid='update_last_login')
