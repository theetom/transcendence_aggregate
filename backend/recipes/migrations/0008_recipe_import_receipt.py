from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("recipes", "0007_recipe_content_revision"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="RecipeImportReceipt",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("request_id", models.UUIDField()),
                ("file_sha256", models.CharField(max_length=64)),
                ("recipes", models.JSONField(default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "constraints": [models.UniqueConstraint(
                    fields=("user", "request_id"), name="unique_recipe_import_request",
                )],
            },
        ),
    ]
