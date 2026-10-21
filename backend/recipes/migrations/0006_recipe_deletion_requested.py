from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("recipes", "0005_recipe_rejection"),
    ]

    operations = [
        migrations.AddField(
            model_name="recipe",
            name="deletion_requested",
            field=models.BooleanField(default=False),
        ),
    ]
