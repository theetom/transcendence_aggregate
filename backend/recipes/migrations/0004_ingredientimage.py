from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('recipes', '0003_category_ingredient_recipe_date_created_recipe_user_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='IngredientImage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('image', models.ImageField(upload_to='ingredients/')),
                ('ingredient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='images', to='recipes.ingredient')),
            ],
        ),
    ]