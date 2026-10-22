from django.db import models

class Recipe(models.Model):
    title = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    approved = models.BooleanField(default=False)
    rejected = models.BooleanField(default=False)
    rejection_reason = models.TextField(blank=True, default="")
    deletion_requested = models.BooleanField(default=False)
    content_revision = models.PositiveIntegerField(default=1, editable=False)
    ingredients = models.ManyToManyField('Ingredient', through='RecipeIngredient')
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE)
    date_created = models.DateTimeField(auto_now_add=True)
    categories = models.ManyToManyField('Category', related_name='recipes', blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(approved=False) | models.Q(rejected=False),
                name="recipe_approval_rejection_exclusive",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(rejected=False, rejection_reason="")
                    | (models.Q(rejected=True) & ~models.Q(rejection_reason=""))
                ),
                name="recipe_rejection_reason_matches_status",
            ),
        ]

    def __str__(self):
        return self.title

class Ingredient(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name

class RecipeIngredient(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='recipe_ingredients')
    ingredient = models.ForeignKey(Ingredient, on_delete=models.CASCADE)
    quantity = models.CharField(max_length=50)
    unit = models.CharField(max_length=50)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['recipe', 'ingredient'], name='unique_recipe_ingredient')
        ]
    def __str__(self):
        return f"{self.quantity} {self.unit} of {self.ingredient.name} for {self.recipe.title}"

class RecipeStep(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='steps')
    step_number = models.PositiveIntegerField()
    instruction = models.TextField()

    class Meta:
        unique_together = ('recipe', 'step_number')
        ordering = ['step_number']

    def __str__(self):
        return f"Step {self.step_number} for {self.recipe.title}"

class Category(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class RecipeImage(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="recipes/")
