from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("recipes", "0006_recipe_deletion_requested"),
    ]

    operations = [
        migrations.AddField(
            model_name="recipe",
            name="content_revision",
            field=models.PositiveIntegerField(default=1, editable=False),
        ),
    ]
