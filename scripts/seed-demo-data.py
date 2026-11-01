#!/usr/bin/env python3
"""Load the fictional Savour catalogue without changing existing records.

From the repository root with the matching backend/PostgreSQL already running:
    python3 scripts/seed-demo-data.py seed
    python3 scripts/seed-demo-data.py status

Fresh demo accounts use the documented simple demo-only passwords.
The local access copy is kept in ignored data/database-private/, never printed.
The seed is additive and transactional. Reruns report the existing marked set;
they never reset accounts, moderation exercises, reviews or favourites.
"""

import argparse
import base64
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parent.parent
CATALOGUE = ROOT / "demos/catalogue"
PRIVATE = ROOT / "data/database-private"
ACCESS = PRIVATE / "demo-catalogue-v1-access.json"
MARKER = "Savour demo catalogue v1"
USERNAMES = ("ana", "marco", "lee")
DEFAULT_PASSWORDS = {"ana": "anapassword", "marco": "marcopassword", "lee": "leepassword"}
LEGACY_USERNAMES = {"ana": "demo_ana", "marco": "demo_marco", "lee": "demo_lee"}
MAX_PHOTO_BYTES = 5 * 1024 * 1024


BACKEND = r'''
import base64
from datetime import timedelta
import json
import os
import sys
from uuid import uuid4

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.contrib.auth.models import Group
from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone
from recipes.models import Recipe, RecipeImage
from recipes.serializers import RecipeDetailedSerializer
from recipes.transfer_formats import _photo, encode_recipes
from reviews.models import Review
from reviews.serializers import ReviewSerializer
from users.models import UserProfile

MARKER = 'Savour demo catalogue v1'
ACCOUNTS = (
    ('ana', 'Ana', 'Silva', 'Portuguese home cooking, seasonal soups and weekend baking.'),
    ('marco', 'Marco', 'Costa', 'Mediterranean suppers, fish dishes and market vegetables.'),
    ('lee', 'Lee', 'Park', 'Rice bowls, vegetarian lunches and quick weekday cooking.'),
)
NAMES = [item[0] for item in ACCOUNTS]
EMAILS = [name + '@example.com' for name in NAMES]
AGE_DAYS = (90, 75, 60, 45, 32, 28, 26, 24, 22, 20, 18, 16, 14,
            12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0)
COMMENTS = (
    'The instructions were easy to follow; I would make this again.',
    'A useful weekday recipe. I adjusted the seasoning at the table.',
    'Good texture and a clear ingredient list; the leftovers kept well.',
    'This took longer in my kitchen, but the final dish was satisfying.',
    'I would change the seasoning next time to suit my taste.',
)


def existing_set():
    """A marker group plus its three fictional profiles identifies our own data."""
    group = Group.objects.filter(name=MARKER).first()
    users = list(get_user_model().objects.filter(username__in=NAMES).order_by('id'))
    if group is None:
        return None
    if (set(group.user_set.values_list('username', flat=True)) != set(NAMES)
            or {user.username for user in users} != set(NAMES)
            or group.permissions.exists()):
        raise RuntimeError('The reserved demo marker is occupied or incomplete; nothing changed.')
    for user in users:
        profile = UserProfile.objects.filter(user=user).first()
        if profile is None or not profile.bio.startswith(MARKER + '\n'):
            raise RuntimeError('A reserved demo profile cannot be identified safely; nothing changed.')
    return users


def summary(users, message):
    rows = Recipe.objects.filter(user__in=users).order_by('id') if users else Recipe.objects.none()
    return {
        'result': message,
        'accounts': [{'id': user.pk, 'username': user.username, 'name': user.get_full_name(),
                      'staff': user.is_staff, 'superuser': user.is_superuser} for user in users or []],
        'recipe_count': rows.count(),
        'review_count': Review.objects.filter(recipe__in=rows).count(),
        'recipes': [{'id': recipe.pk, 'title': recipe.title, 'approved': recipe.approved,
                     'rejected': recipe.rejected, 'deletion_requested': recipe.deletion_requested,
                     'review_count': recipe.reviews.count()} for recipe in rows],
    }


def fixture_exports(recipes):
    if len(recipes) != 3:
        raise RuntimeError('The three fixture recipes are unavailable; no fixtures replaced.')
    return {name: base64.b64encode(encode_recipes(recipes, name)).decode('ascii')
            for name in ('json', 'csv')}


def run(payload):
    if connection.vendor != 'postgresql':
        raise RuntimeError('The demo loader requires the existing PostgreSQL backend.')
    mode = payload['mode']
    if mode == 'status':
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            return summary(existing_set(), 'Status only; no records changed.')

    photos = []
    saved_files = []
    committed = False
    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_advisory_xact_lock(%s, %s)', [730017, 6])
                # Coordinate reserved account checks with the signup endpoint.
                cursor.execute('SELECT pg_advisory_xact_lock(%s, %s)', [730017, 2])
            users = existing_set()
            if users is not None:
                result = summary(users, 'Existing demo set retained; no records changed.')
                result['credentials_match'] = all(
                    check_password(payload['passwords'][user.username], user.password) for user in users)
                known_ids = payload.get('fixture_recipe_ids', [])
                if len(known_ids) == 3:
                    candidates = list(Recipe.objects.filter(pk__in=known_ids, user__in=users).order_by('id'))
                    if len(candidates) == 3:
                        result['exports'] = fixture_exports(candidates)
                        result['fixture_recipe_ids'] = [recipe.pk for recipe in candidates]
                return result

            User = get_user_model()
            occupied = Q()
            for name, email in zip(NAMES, EMAILS):
                occupied |= Q(username__iexact=name) | Q(email__iexact=email)
            if User.objects.filter(occupied).exists() or Group.objects.filter(name__iexact=MARKER).exists():
                raise RuntimeError('A reserved demo username, email or marker group exists; nothing changed.')

            specs = payload['recipes']
            if len(specs) != 25:
                raise RuntimeError('Expected exactly 25 catalogue recipes; nothing changed.')
            prepared = []
            for spec in specs:
                content = {key: spec[key] for key in ('title', 'description', 'ingredients', 'steps')}
                content['categories'] = [{'name': name} for name in spec['categories']]
                serializer = RecipeDetailedSerializer(data=content)
                if not serializer.is_valid():
                    raise RuntimeError('Catalogue recipe validation failed for ' + spec['slug'] + '; nothing changed.')
                raw = base64.b64decode(payload['photos'][spec['image']], validate=True)
                upload = _photo(raw, 'image/png')
                photos.append(upload)
                prepared.append((spec, content, serializer, raw))

            # Validate the three moderation titles/content before creating accounts.
            moderation = []
            labels = ('Awaiting approval', 'Needs revision', 'Removal requested')
            for index, label in enumerate(labels):
                spec, original, unused_serializer, raw = prepared[index]
                content = dict(original)
                content['title'] = original['title'][:72] + ' - ' + label
                content['description'] += '\n\nFictional moderation exercise: ' + label.lower() + '.'
                serializer = RecipeDetailedSerializer(data=content)
                if not serializer.is_valid():
                    raise RuntimeError('Moderation content validation failed; nothing changed.')
                moderation.append((serializer, raw))

            marker = Group.objects.create(name=MARKER)
            users = []
            for name, first, last, bio in ACCOUNTS:
                user = User.objects.create_user(
                    username=name, email=name + '@example.com', password=payload['passwords'][name],
                    first_name=first, last_name=last, is_active=True,
                    is_staff=False, is_superuser=False)
                user.groups.add(marker)
                UserProfile.objects.create(
                    user=user, bio=MARKER + '\nFictional demonstration account. ' + bio
                    + ' Recipe and review dates are synthetic for analytics demonstrations.')
                users.append(user)

            # Django storage is outside the DB transaction; retain only new paths for rollback cleanup.
            def attach_photo(recipe, raw):
                upload = _photo(raw, 'image/png')
                photos.append(upload)
                storage = RecipeImage._meta.get_field('image').storage
                name = 'recipes/savour-demo-v1-' + uuid4().hex + '.png'
                if storage.exists(name):
                    raise RuntimeError('A new demo photo name collided; nothing changed.')
                path = storage.save(name, upload)
                saved_files.append((storage, path))
                RecipeImage.objects.create(recipe=recipe, image=path)

            anchor = timezone.now() - timedelta(hours=2)
            recipes = []
            for index, (spec, content, serializer, raw) in enumerate(prepared):
                recipe = serializer.save(user=users[index % 3])
                date = anchor - timedelta(days=AGE_DAYS[index])
                Recipe.objects.filter(pk=recipe.pk).update(approved=True, date_created=date)
                recipe.approved, recipe.date_created = True, date
                attach_photo(recipe, raw)
                recipes.append(recipe)
                reviewers = [user for user in users if user.pk != recipe.user_id]
                # Zero to two different reviewers, all five grades, and recent reviews on old recipes.
                for offset, reviewer in enumerate(reviewers[:(index + 1) % 4]):
                    grade = (index + offset) % 5 + 1
                    review_serializer = ReviewSerializer(data={
                        'grade': grade, 'comment': COMMENTS[(grade + offset) % len(COMMENTS)]})
                    if not review_serializer.is_valid():
                        raise RuntimeError('Demo review validation failed; nothing changed.')
                    review = review_serializer.save(user=reviewer, recipe=recipe)
                    historical_ages = {0: (90,), 1: (0, 75), 2: (60, 45, 30)}
                    age = (historical_ages[index][offset] if index in historical_ages else
                           min(AGE_DAYS[index], (index * 3 + offset * 2) % 15))
                    Review.objects.filter(pk=review.pk).update(timestamp=anchor - timedelta(days=age))

            for index, (serializer, raw) in enumerate(moderation):
                recipe = serializer.save(user=users[index])
                status = {'date_created': anchor - timedelta(days=index + 1)}
                if index == 1:
                    status.update(rejected=True, rejection_reason='Please clarify the serving quantity and cooling step before resubmitting.')
                elif index == 2:
                    status.update(approved=True, deletion_requested=True)
                Recipe.objects.filter(pk=recipe.pk).update(**status)
                attach_photo(recipe, raw)

            for index, user in enumerate(users):
                user.profile.favorites.add(*[recipe for number, recipe in enumerate(recipes)
                                             if number % 5 == index and recipe.user_id != user.pk])
            # The first three public recipes belong to three different ordinary demo authors.
            result = summary(users, 'Added 25 public recipes and 3 moderation examples; existing records preserved.')
            result['fixture_recipe_ids'] = [recipe.pk for recipe in recipes[:3]]
            result['exports'] = fixture_exports(recipes[:3])
            result['credentials_match'] = True
        committed = True
        return result
    finally:
        for upload in photos:
            upload.close()
        if not committed:
            # A recognized set returns without new files; never remove existing photos.
            for storage, path in reversed(saved_files):
                try:
                    storage.delete(path)
                except Exception:
                    print('A newly written demo photo could not be removed after rollback.', file=sys.stderr)


try:
    payload = json.load(sys.stdin)
    print(json.dumps(run(payload), ensure_ascii=False))
except Exception:
    print('Demo operation failed; no credentials printed. Existing records were not reset.', file=sys.stderr)
    sys.exit(1)
'''


def safe_private_directory():
    current = ROOT
    for part in PRIVATE.relative_to(ROOT).parts:
        current = current / part
        if current.is_symlink():
            raise RuntimeError("Private demo paths must not be symbolic links.")
        current.mkdir(mode=0o700, exist_ok=True)
        if not current.is_dir():
            raise RuntimeError("Private demo path is not a directory.")
    PRIVATE.chmod(0o700)


def access_file():
    safe_private_directory()
    if ACCESS.exists() or ACCESS.is_symlink():
        info = ACCESS.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 65536):
            raise RuntimeError("Existing demo access file must be a private regular file owned by you.")
        value = json.loads(ACCESS.read_text(encoding="utf-8"))
        passwords = value.get("passwords") if isinstance(value, dict) else None
        legacy_names = set(LEGACY_USERNAMES.values())
        if (not isinstance(value, dict) or value.get("marker") != MARKER
                or not isinstance(passwords, dict)
                or set(passwords) not in (set(USERNAMES), legacy_names, legacy_names | {"demo_staff"})):
            raise RuntimeError("Existing private demo access file is invalid; it was not replaced.")
        current_passwords = {
            name: passwords[name if name in passwords else LEGACY_USERNAMES[name]]
            for name in USERNAMES
        }
        if any(not isinstance(password, str) or not password for password in current_passwords.values()):
            raise RuntimeError("Existing private demo access file is invalid; it was not replaced.")
        return {**value, "passwords": current_passwords}
    value = {"marker": MARKER, "passwords": dict(DEFAULT_PASSWORDS)}
    descriptor = os.open(ACCESS, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    return value


def load_catalogue():
    path = CATALOGUE / "recipes.json"
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 1024 * 1024:
        raise RuntimeError("Catalogue recipe source is missing or unsafe.")
    document = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(document, dict) or type(document.get("version")) is not int
            or document["version"] != 1 or set(document) != {"version", "recipes"}):
        raise RuntimeError("Catalogue must be a version 1 recipe document.")
    specs = document["recipes"]
    if not isinstance(specs, list) or len(specs) != 25:
        raise RuntimeError("Catalogue must contain exactly 25 recipe objects.")
    photos = {}
    slugs = set()
    for spec in specs:
        slug = spec.get("slug", "")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or slug in slugs:
            raise RuntimeError("Catalogue slugs must be unique safe names.")
        slugs.add(slug)
        if spec.get("image") != slug + ".png":
            raise RuntimeError("Every catalogue recipe needs its matching PNG photo.")
        photo = CATALOGUE / "photos" / spec["image"]
        if photo.is_symlink() or not photo.is_file() or not 0 < photo.stat().st_size <= MAX_PHOTO_BYTES:
            raise RuntimeError("A catalogue photo is missing, unsafe, empty or larger than 5 MiB.")
        photos[spec["image"]] = base64.b64encode(photo.read_bytes()).decode("ascii")
    return specs, photos


def atomic_write(path, raw, mode):
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise RuntimeError("An output path is unsafe; no output replaced.")
    descriptor, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("seed", "status"))
    arguments = parser.parse_args()
    payload = {"mode": arguments.mode}
    access = None
    if arguments.mode == "seed":
        specs, photos = load_catalogue()
        access = access_file()  # Persist demo access details before any backend operation.
        payload.update(recipes=specs, photos=photos, passwords=access["passwords"],
                       fixture_recipe_ids=access.get("fixture_recipe_ids", []))
    result = subprocess.run(
        ["docker", "compose", "exec", "-T", "backend", "python", "-c", BACKEND],
        cwd=ROOT, input=json.dumps(payload).encode("utf-8"), stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("Backend demo operation failed. Check backend availability and reserved-name conflicts; existing records were not reset.")
    response = json.loads(result.stdout)
    exports = response.pop("exports", {})
    if access is not None:
        if "fixture_recipe_ids" in response:
            access["fixture_recipe_ids"] = response["fixture_recipe_ids"]
            atomic_write(ACCESS, (json.dumps(access, indent=2) + "\n").encode(), 0o600)
        for format_name, encoded in exports.items():
            if format_name not in {"json", "csv"}:
                raise RuntimeError("Backend returned an unexpected fixture format.")
            raw = base64.b64decode(encoded, validate=True)
            if not 0 < len(raw) <= 20 * 1024 * 1024:
                raise RuntimeError("Backend returned an invalid fixture size.")
            destination = CATALOGUE / ("import-samples." + format_name)
            # Existing exercise files are retained if they have been edited.
            if destination.exists() and (destination.is_symlink() or destination.read_bytes() != raw):
                raise RuntimeError("An existing import fixture differs; it was preserved. Demo data may already be committed in the database.")
            atomic_write(destination, raw, 0o644)
    print(json.dumps(response, indent=2, ensure_ascii=False))
    if access is not None:
        if response.get("credentials_match"):
            print("Private demo login details: data/database-private/demo-catalogue-v1-access.json (do not commit or paste into chat).")
        else:
            print("Existing demo passwords differ from this computer's private file. Use your administrator to arrange access; no password was changed.")
        if exports:
            print("Three-recipe bulk-import examples saved: demos/catalogue/import-samples.json and import-samples.csv")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as error:
        # Never echo backend stderr, payloads, passwords, account hashes or environment.
        print("STOP: " + str(error) if isinstance(error, RuntimeError) else "STOP: A demo file or command could not be read safely.", file=sys.stderr)
        sys.exit(1)
