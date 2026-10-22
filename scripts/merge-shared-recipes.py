"""Retain local recipes in a downloaded database; run inside the backend image.

The previous local database is read only. Existing matching records keep the
downloaded version. Match recipes by author, title and original creation time because
numeric IDs can differ between computers. The photo helper installs incoming
files and adjusts incoming references before this merger copies local-only rows.
"""

import copy
import datetime
import json
import os
import sys


LOCAL = "sharing_local"
TARGET = "default"


def timestamp(value):
    if value is None:
        raise ValueError("A recipe or review is missing its original creation time.")
    if value.tzinfo is not None:
        value = value.astimezone(datetime.timezone.utc)
    return value.isoformat(timespec="microseconds")


def combine(local_database, imported_database):
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    os.environ["POSTGRES_DB"] = imported_database
    import django

    django.setup()
    from django.contrib.auth import get_user_model
    from django.contrib.auth.models import Group, Permission
    from django.db import connections, transaction
    from recipes.models import Category, Ingredient, Recipe, RecipeImage, RecipeIngredient, RecipeStep
    from reviews.models import Review
    from users.models import UserProfile

    settings = copy.deepcopy(connections.databases[TARGET])
    settings["NAME"] = local_database
    connections.databases[LOCAL] = settings
    User = get_user_model()
    counts = {"users_added": 0, "recipes_added": 0, "reviews_added": 0}

    try:
        with transaction.atomic(using=LOCAL), transaction.atomic(using=TARGET):
            with connections[LOCAL].cursor() as cursor:
                cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
                local_columns = {
                    field.name for field in connections[LOCAL].introspection.get_table_description(
                        cursor, Recipe._meta.db_table,
                    )
                }
            rejection_fields = {"rejected", "rejection_reason"}
            local_has_rejection = rejection_fields.issubset(local_columns)
            local_has_deletion_request = "deletion_requested" in local_columns
            local_has_content_revision = "content_revision" in local_columns
            if local_columns.intersection(rejection_fields) and not local_has_rejection:
                raise ValueError("The local recipe rejection fields are incomplete.")
            with connections[TARGET].cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(42424217)")

            users = {}
            target_users = {user.username: user for user in User.objects.using(TARGET).all()}
            for user in User.objects.using(LOCAL).all().order_by("pk"):
                matched = target_users.get(user.username)
                if matched is None:
                    fields = {field.attname: getattr(user, field.attname)
                              for field in User._meta.concrete_fields if not field.primary_key}
                    matched = User.objects.using(TARGET).create(**fields)
                    target_users[user.username] = matched
                    counts["users_added"] += 1
                    for group in user.groups.using(LOCAL).all():
                        target_group, group_created = Group.objects.using(TARGET).get_or_create(name=group.name)
                        if group_created:
                            for permission in group.permissions.using(LOCAL).select_related("content_type"):
                                counterpart = Permission.objects.using(TARGET).get(
                                    codename=permission.codename,
                                    content_type__app_label=permission.content_type.app_label,
                                    content_type__model=permission.content_type.model,
                                )
                                target_group.permissions.add(counterpart)
                        matched.groups.add(target_group)
                    for permission in user.user_permissions.using(LOCAL).select_related("content_type"):
                        counterpart = Permission.objects.using(TARGET).get(
                            codename=permission.codename,
                            content_type__app_label=permission.content_type.app_label,
                            content_type__model=permission.content_type.model,
                        )
                        matched.user_permissions.add(counterpart)
                users[user.pk] = matched.pk

            def named_records(model):
                # Keep existing duplicate names separate and map their ordinal
                # position, so two ingredients do not collapse into one row.
                available = {}
                for pk, name in model.objects.using(TARGET).order_by("pk").values_list("pk", "name"):
                    available.setdefault(name, []).append(pk)
                positions = {}
                mapping = {}
                for pk, name in model.objects.using(LOCAL).order_by("pk").values_list("pk", "name"):
                    position = positions.get(name, 0)
                    candidates = available.setdefault(name, [])
                    if position == len(candidates):
                        candidates.append(model.objects.using(TARGET).create(name=name).pk)
                    mapping[pk] = candidates[position]
                    positions[name] = position + 1
                return mapping

            ingredients = named_records(Ingredient)
            categories = named_records(Category)
            recipes = {}
            target_recipes = {}
            for recipe in Recipe.objects.using(TARGET).select_related("user").order_by("pk"):
                identity = (recipe.user.username, timestamp(recipe.date_created), recipe.title)
                target_recipes.setdefault(identity, []).append(recipe.pk)
            local_positions = {}
            local_recipes = Recipe.objects.using(LOCAL).select_related("user").order_by("pk")
            if not local_has_rejection:
                # Startup imports before normal migrations. Read older local
                # recipes without requiring or changing their missing columns.
                local_recipes = local_recipes.defer(*rejection_fields)
            if not local_has_deletion_request:
                local_recipes = local_recipes.defer("deletion_requested")
            if not local_has_content_revision:
                local_recipes = local_recipes.defer("content_revision")
            for recipe in local_recipes:
                identity = (recipe.user.username, timestamp(recipe.date_created), recipe.title)
                position = local_positions.get(identity, 0)
                candidates = target_recipes.setdefault(identity, [])
                local_positions[identity] = position + 1
                if position == len(candidates):
                    created = Recipe.objects.using(TARGET).create(
                        title=recipe.title, description=recipe.description,
                        approved=recipe.approved, user_id=users[recipe.user_id],
                        rejected=recipe.rejected if local_has_rejection else False,
                        rejection_reason=recipe.rejection_reason if local_has_rejection else "",
                        deletion_requested=(
                            recipe.deletion_requested if local_has_deletion_request else False
                        ),
                        content_revision=(
                            recipe.content_revision if local_has_content_revision else 1
                        ),
                    )
                    # Preserve auto_now_add values so a recipe keeps the same
                    # identity when it travels to another computer and back.
                    Recipe.objects.using(TARGET).filter(pk=created.pk).update(date_created=recipe.date_created)
                    matched = created.pk
                    candidates.append(matched)
                    counts["recipes_added"] += 1
                    for item in RecipeIngredient.objects.using(LOCAL).filter(recipe_id=recipe.pk):
                        RecipeIngredient.objects.using(TARGET).create(
                            recipe_id=matched, ingredient_id=ingredients[item.ingredient_id],
                            quantity=item.quantity, unit=item.unit,
                        )
                    RecipeStep.objects.using(TARGET).bulk_create([
                        RecipeStep(recipe_id=matched, step_number=step.step_number, instruction=step.instruction)
                        for step in RecipeStep.objects.using(LOCAL).filter(recipe_id=recipe.pk)
                    ])
                    RecipeImage.objects.using(TARGET).bulk_create([
                        RecipeImage(recipe_id=matched, image=image.image.name)
                        for image in RecipeImage.objects.using(LOCAL).filter(recipe_id=recipe.pk)
                    ])
                    created.categories.set([
                        categories[pk] for pk in recipe.categories.using(LOCAL).values_list("pk", flat=True)
                    ])
                else:
                    matched = candidates[position]
                recipes[recipe.pk] = matched

            seen_reviews = {}
            for review in Review.objects.using(TARGET).all():
                identity = (review.recipe_id, review.user_id, timestamp(review.timestamp), review.comment, review.grade)
                seen_reviews[identity] = seen_reviews.get(identity, 0) + 1
            local_reviews = {}
            for review in Review.objects.using(LOCAL).all().order_by("pk"):
                identity = (recipes[review.recipe_id], users[review.user_id], timestamp(review.timestamp), review.comment, review.grade)
                position = local_reviews.get(identity, 0)
                local_reviews[identity] = position + 1
                if position >= seen_reviews.get(identity, 0):
                    created = Review.objects.using(TARGET).create(
                        recipe_id=recipes[review.recipe_id], user_id=users[review.user_id],
                        comment=review.comment, grade=review.grade,
                    )
                    Review.objects.using(TARGET).filter(pk=created.pk).update(timestamp=review.timestamp)
                    seen_reviews[identity] = seen_reviews.get(identity, 0) + 1
                    counts["reviews_added"] += 1

            for profile in UserProfile.objects.using(LOCAL).all():
                target_profile, _ = UserProfile.objects.using(TARGET).get_or_create(
                    user_id=users[profile.user_id],
                    defaults={"bio": profile.bio, "profile_picture": profile.profile_picture.name or ""},
                )
                target_profile.favorites.add(*[
                    recipes[pk] for pk in profile.favorites.using(LOCAL).values_list("pk", flat=True)
                ])
        return counts
    finally:
        connections.close_all()


if __name__ == "__main__":
    try:
        if len(sys.argv) == 3:
            print(json.dumps(combine(sys.argv[1], sys.argv[2]), sort_keys=True))
        else:
            raise ValueError("Expected the local and downloaded database names.")
    except Exception:
        print("Could not prepare shared recipe data. The previous local database was not changed or selected away.", file=sys.stderr)
        sys.exit(1)
