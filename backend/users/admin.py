from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin


class ProjectUserAdmin(UserAdmin):
    def get_fieldsets(self, request, obj=None):
        return tuple(
            (title, {
                **options,
                "fields": tuple(field for field in options["fields"] if field != "last_login"),
            })
            for title, options in super().get_fieldsets(request, obj)
        )

    def get_readonly_fields(self, request, obj=None):
        return tuple(
            field for field in super().get_readonly_fields(request, obj)
            if field != "last_login"
        )


User = get_user_model()
if admin.site.is_registered(User):
    admin.site.unregister(User)
admin.site.register(User, ProjectUserAdmin)
