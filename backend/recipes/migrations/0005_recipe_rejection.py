from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("recipes", "0004_recipe_approved"),
    ]

    operations = [
        migrations.AddField(
            model_name="recipe",
            name="rejected",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="recipe",
            name="rejection_reason",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddConstraint(
            model_name="recipe",
            constraint=models.CheckConstraint(
                condition=models.Q(approved=False) | models.Q(rejected=False),
                name="recipe_approval_rejection_exclusive",
            ),
        ),
        migrations.AddConstraint(
            model_name="recipe",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(rejected=False, rejection_reason="")
                    | (models.Q(rejected=True) & ~models.Q(rejection_reason=""))
                ),
                name="recipe_rejection_reason_matches_status",
            ),
        ),
    ]
