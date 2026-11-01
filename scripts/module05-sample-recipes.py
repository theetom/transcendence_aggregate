"""Add/remove approved sample recipes for user-led Module05 browser checks.

Run from the repository root with the existing backend/database running:
docker compose exec -T backend python - seed < scripts/module05-sample-recipes.py
Replace seed with status or cleanup as needed. No frontend rebuild is needed.
Samples appear on normal public pages; clean them up before exporting shared data.
This helper never modifies existing recipes, users, reviews or media.
"""

import json
import os
import sys


MARKER = 'Module05 pagination samples / 7d9a24f8-26af-43fe-a021-93e6797255ef'
PREFIX = 'M05 sample'
STEP = 'Temporary search sample only; this is not a cooking instruction.'
GROUPS = (
    ('Soups', 'tomato', (
        'Tomato basil soup', 'Roasted pepper soup', 'Garden vegetable soup',
        'Lentil tomato soup', 'White bean soup', 'Chickpea soup',
        'Carrot tomato soup', 'Spiced pumpkin soup', 'Cabbage soup',
        'Minestrone soup', 'Sweet potato soup', 'Barley vegetable soup',
        'Courgette soup', 'Smoky bean soup', 'Rustic tomato soup',
    )),
    ('Bowls', 'rice', (
        'Sesame vegetable bowl', 'Lemon chickpea bowl', 'Mushroom rice bowl',
        'Ginger tofu bowl', 'Roasted carrot bowl', 'Green pea bowl',
        'Broccoli rice bowl', 'Black bean bowl', 'Sweetcorn bowl',
        'Herb vegetable bowl', 'Roasted squash bowl', 'Cucumber rice bowl',
        'Spinach lentil bowl', 'Pepper rice bowl', 'Garden harvest bowl',
    )),
)
SAMPLES = {}
for group, ingredient, names in GROUPS:
    for name in names:
        index = len(SAMPLES) + 1
        SAMPLES[index] = {
            'title': f'{PREFIX} {index:02d} - {name}',
            'category': f'{PREFIX} - {group}',
            'ingredient': f'{PREFIX} - {ingredient}',
        }


def description(metadata):
    return MARKER + '\n' + json.dumps(metadata, sort_keys=True)


def verify_sample(recipe):
    """Require the complete saved identity before reusing or deleting a row."""
    try:
        metadata = json.loads(recipe.description[len(MARKER) + 1:])
        spec = SAMPLES[metadata['index']]
        expected = {
            'index': metadata['index'],
            'owner_id': recipe.user_id,
            'category_id': metadata['category_id'],
            'ingredient_id': metadata['ingredient_id'],
        }
        matches = (
            recipe.description == description(expected)
            and recipe.title == spec['title']
            and recipe.approved and not recipe.rejected
            and not recipe.rejection_reason and not recipe.deletion_requested
            and recipe.content_revision == 1
            and list(recipe.categories.values_list('id', 'name'))
            == [(metadata['category_id'], spec['category'])]
            and list(recipe.recipe_ingredients.values_list(
                'ingredient_id', 'ingredient__name', 'quantity', 'unit',
            )) == [(metadata['ingredient_id'], spec['ingredient'], '1', 'portion')]
            and list(recipe.steps.values_list('step_number', 'instruction')) == [(1, STEP)]
            and not recipe.reviews.exists()
            and not recipe.images.exists()
            and not recipe.favorited_by.exists()
        )
    except (KeyError, TypeError, ValueError):
        matches = False
    if not matches:
        raise RuntimeError(
            f'Sample recipe {recipe.pk} has changed or has added content. '
            'No changes saved; inspect it before continuing.'
        )
    return metadata


def run(mode):
    # Imports/setup execute only when the user runs this helper in the container.
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    import django
    django.setup()
    from django.contrib.auth import get_user_model
    from django.db import connection, transaction
    from recipes.models import Category, Ingredient, Recipe, RecipeIngredient, RecipeStep

    if connection.vendor != 'postgresql':
        raise RuntimeError('Expected the existing PostgreSQL database; no changes made.')

    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(%s, %s)', [730017, 5])

        recipes = list(Recipe.objects.select_for_update().filter(
            description__startswith=MARKER + '\n',
        ).order_by('id'))
        # Match website edits: lock recipes before the shared named catalogue.
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(%s, %s)', [730017, 1])
        metadata = [verify_sample(recipe) for recipe in recipes]
        indices = [item['index'] for item in metadata]
        if len(indices) != len(set(indices)):
            raise RuntimeError('Duplicate sample identities found; no changes saved.')

        result = {'mode': mode, 'sample_count': len(recipes), 'recipe_ids': [r.pk for r in recipes]}
        if mode == 'seed':
            if recipes:
                if set(indices) != set(SAMPLES):
                    raise RuntimeError('Only part of the sample set remains. Run cleanup before seeding again.')
                result['result'] = 'All 30 samples already exist; nothing added.'
            else:
                titles = [spec['title'] for spec in SAMPLES.values()]
                category_names = {spec['category'] for spec in SAMPLES.values()}
                ingredient_names = {spec['ingredient'] for spec in SAMPLES.values()}
                title_keys = {name.strip().lower() for name in titles}
                category_keys = {name.strip().lower() for name in category_names}
                ingredient_keys = {name.strip().lower() for name in ingredient_names}
                if (any(title.strip().lower() in title_keys for title in Recipe.objects.values_list('title', flat=True))
                        or any(name.strip().lower() in category_keys for name in Category.objects.values_list('name', flat=True))
                        or any(name.strip().lower() in ingredient_keys for name in Ingredient.objects.values_list('name', flat=True))):
                    raise RuntimeError('A sample name already exists outside this set; no changes saved.')
                owner = get_user_model().objects.filter(is_active=True, is_staff=True).order_by('id').first()
                if owner is None:
                    raise RuntimeError('No existing active staff account found; no changes saved.')
                categories = {name: Category.objects.create(name=name) for name in sorted(category_names)}
                ingredients = {name: Ingredient.objects.create(name=name) for name in sorted(ingredient_names)}
                recipes = []
                for index, spec in SAMPLES.items():
                    category = categories[spec['category']]
                    ingredient = ingredients[spec['ingredient']]
                    recipe = Recipe.objects.create(
                        title=spec['title'], approved=True, user=owner,
                        description=description({
                            'index': index, 'owner_id': owner.pk,
                            'category_id': category.pk, 'ingredient_id': ingredient.pk,
                        }),
                    )
                    recipe.categories.add(category)
                    RecipeIngredient.objects.create(
                        recipe=recipe, ingredient=ingredient, quantity='1', unit='portion',
                    )
                    RecipeStep.objects.create(recipe=recipe, step_number=1, instruction=STEP)
                    recipes.append(recipe)
                result.update({
                    'result': 'Added 30 approved samples.', 'sample_count': len(recipes),
                    'recipe_ids': [r.pk for r in recipes], 'owner': owner.username,
                })
        elif mode == 'cleanup':
            category_ids = {item['category_id'] for item in metadata}
            ingredient_ids = {item['ingredient_id'] for item in metadata}
            # IDs come from verified sample identities, never from a title prefix.
            Recipe.objects.filter(pk__in=[recipe.pk for recipe in recipes]).delete()
            Category.objects.filter(pk__in=category_ids, recipes__isnull=True).delete()
            Ingredient.objects.filter(pk__in=ingredient_ids, recipeingredient__isnull=True).delete()
            result.update({'result': f'Removed {len(recipes)} verified sample recipes.', 'sample_count': 0})
        else:
            result['result'] = 'Status only; no records changed.'

    # Print success only after the complete transaction commits.
    print(json.dumps(result, indent=2))
    if mode == 'seed':
        print('Open: https://localhost:8443/results/search?q=M05%20sample')
        print('Expected: 30 matches; 5 pages at size 6, 3 at size 12, 2 at size 24.')
        print('Filter category M05 sample - Soups: 15 matches, starting on page 1.')
        print('Cleanup before shared-data export:')
        print('docker compose exec -T backend python - cleanup < scripts/module05-sample-recipes.py')


if __name__ == '__main__':
    if len(sys.argv) != 2 or sys.argv[1] not in {'seed', 'status', 'cleanup'}:
        sys.exit('Choose seed, status or cleanup. See the instructions at the top of this file.')
    try:
        run(sys.argv[1])
    except Exception as error:
        print(f'STOP: {error}', file=sys.stderr)
        sys.exit(1)
