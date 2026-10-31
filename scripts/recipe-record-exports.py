"""Readable recipe exports for the existing PostgreSQL snapshot workflow.

Only standard-library definitions run when this helper is loaded. The caller
executes RECIPE_RECORD_SQL read-only while website writes are paused, then calls
build_exports() with that private NDJSON file and the validated photo index.
Snapshots remain the import format; these JSON/CSV files expose actual records.
CSV scalar text that could be interpreted as a spreadsheet formula is prefixed
with an apostrophe. JSON and the database snapshot retain the original text.
"""

import csv
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat


RECIPE_RECORD_SQL = """
SELECT json_build_object(
    'id', r.id,
    'title', r.title,
    'description', r.description,
    'owner_id', r.user_id,
    'owner_username', u.username,
    'date_created', to_char(r.date_created AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'approved', r.approved,
    'rejected', r.rejected,
    'rejection_reason', r.rejection_reason,
    'deletion_requested', r.deletion_requested,
    'content_revision', r.content_revision,
    'ingredients', COALESCE((
        SELECT json_agg(json_build_object(
            'id', i.id, 'name', i.name, 'quantity', ri.quantity, 'unit', ri.unit
        ) ORDER BY ri.id)
        FROM recipes_recipeingredient AS ri
        JOIN recipes_ingredient AS i ON i.id = ri.ingredient_id
        WHERE ri.recipe_id = r.id
    ), '[]'::json),
    'categories', COALESCE((
        SELECT json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.id)
        FROM recipes_recipe_categories AS rc
        JOIN recipes_category AS c ON c.id = rc.category_id
        WHERE rc.recipe_id = r.id
    ), '[]'::json),
    'steps', COALESCE((
        SELECT json_agg(json_build_object(
            'step_number', s.step_number, 'instruction', s.instruction
        ) ORDER BY s.step_number, s.id)
        FROM recipes_recipestep AS s
        WHERE s.recipe_id = r.id
    ), '[]'::json),
    'images', COALESCE((
        SELECT json_agg(json_build_object('id', image.id, 'path', image.image) ORDER BY image.id)
        FROM recipes_recipeimage AS image
        WHERE image.recipe_id = r.id
    ), '[]'::json)
)
FROM recipes_recipe AS r
JOIN auth_user AS u ON u.id = r.user_id
ORDER BY r.id
"""

RECIPE_FIELDS = (
    'id', 'title', 'description', 'owner_id', 'owner_username', 'date_created',
    'approved', 'rejected', 'rejection_reason', 'deletion_requested',
    'content_revision', 'ingredients', 'categories', 'steps', 'images',
)
NESTED_FIELDS = {'ingredients', 'categories', 'steps', 'images'}
SNAPSHOT_ID = re.compile(r'\d{8}T\d{6}Z_[0-9a-f]{12}\Z')
PHOTO_BLOB = re.compile(r'[0-9a-f]{64}\.[a-z0-9]{1,10}\Z')
MAX_RECORD_BYTES = 16 * 1024 * 1024
MAX_IDENTIFIER = 9223372036854775807


def _integer(value, *, minimum=1):
    return type(value) is int and minimum <= value <= MAX_IDENTIFIER


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('A recipe export record contains duplicate fields.')
        result[key] = value
    return result


def _invalid_constant(value):
    raise ValueError('A recipe export record contains an invalid number.')


def _require_fields(value, names):
    if not isinstance(value, dict) or set(value) != set(names):
        raise ValueError('A recipe export record has an unexpected structure.')


def _validate_recipe(recipe):
    _require_fields(recipe, RECIPE_FIELDS)
    if (not _integer(recipe['id']) or not _integer(recipe['owner_id'])
            or not _integer(recipe['content_revision'], minimum=0)):
        raise ValueError('A recipe export record contains an invalid identifier or revision.')
    for field in ('title', 'description', 'owner_username', 'date_created', 'rejection_reason'):
        if not isinstance(recipe[field], str):
            raise ValueError('A recipe export record contains invalid text.')
    for field in ('approved', 'rejected', 'deletion_requested'):
        if type(recipe[field]) is not bool:
            raise ValueError('A recipe export record contains an invalid status.')
    try:
        created = datetime.datetime.fromisoformat(recipe['date_created'].replace('Z', '+00:00'))
    except ValueError:
        raise ValueError('A recipe export record contains an invalid timestamp.') from None
    if created.utcoffset() != datetime.timedelta(0):
        raise ValueError('Recipe export timestamps must use UTC.')
    if any(not isinstance(recipe[field], list) for field in NESTED_FIELDS):
        raise ValueError('A recipe export record contains invalid related records.')

    for ingredient in recipe['ingredients']:
        _require_fields(ingredient, ('id', 'name', 'quantity', 'unit'))
        if (not _integer(ingredient['id'])
                or any(not isinstance(ingredient[field], str) for field in ('name', 'quantity', 'unit'))):
            raise ValueError('A recipe export contains an invalid ingredient.')
    for category in recipe['categories']:
        _require_fields(category, ('id', 'name'))
        if not _integer(category['id']) or not isinstance(category['name'], str):
            raise ValueError('A recipe export contains an invalid category.')
    for step in recipe['steps']:
        _require_fields(step, ('step_number', 'instruction'))
        if not _integer(step['step_number'], minimum=0) or not isinstance(step['instruction'], str):
            raise ValueError('A recipe export contains an invalid step.')
    for image in recipe['images']:
        _require_fields(image, ('id', 'path'))
        if not _integer(image['id']) or not isinstance(image['path'], str):
            raise ValueError('A recipe export contains an invalid image reference.')


def _add_photo_files(recipe, references, files, seen):
    for image in recipe['images']:
        identifier = str(image['id'])
        if identifier in seen:
            raise ValueError('A recipe export contains a duplicate photo reference.')
        reference = references.get(identifier)
        if not image['path'] and reference is None:
            # Existing blank legacy image rows do not reference an uploaded file.
            image['file'] = None
            continue
        if (not isinstance(reference, dict) or reference.get('path') != image['path']
                or not isinstance(reference.get('file'), str)
                or not PHOTO_BLOB.fullmatch(reference['file']) or reference['file'] not in files):
            raise ValueError('Recipe export photos do not match the snapshot photo index.')
        image['file'] = 'photos/' + reference['file']
        seen.add(identifier)


def _csv_value(value):
    if type(value) is bool:
        return 'true' if value else 'false'
    if isinstance(value, str):
        if value.lstrip().startswith(('=', '+', '-', '@')) or value.startswith(('\t', '\r', '\n')):
            return "'" + value
    return value


def _private_text(directory_descriptor, name):
    descriptor = os.open(
        name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        0o600, dir_fd=directory_descriptor,
    )
    try:
        return os.fdopen(descriptor, 'w', encoding='utf-8', newline='')
    except BaseException:
        os.close(descriptor)
        raise


def _file_metadata(directory_descriptor, name):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_descriptor)
    with os.fdopen(descriptor, 'rb') as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
            raise ValueError('A recipe export file is not a regular private file.')
        digest = hashlib.sha256()
        size = 0
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
            size += len(block)
        after = os.fstat(stream.fileno())
        if (before.st_size != size or before.st_size != after.st_size
                or before.st_mtime_ns != after.st_mtime_ns or before.st_ctime_ns != after.st_ctime_ns):
            raise ValueError('A recipe export file changed while being saved.')
    return {'bytes': size, 'sha256': digest.hexdigest()}


def build_exports(directory, snapshot_id, photos):
    """Create fixed-name JSON/CSV files from one private NDJSON record stream.

    No database/API calls occur here. A single recipe line may use at most 16 MiB;
    records stream in ascending ID order without loading the whole catalogue.
    The caller validates photos before calling and validates/publishes returned
    file metadata with its snapshot. Existing output files are never overwritten.
    """
    if not isinstance(snapshot_id, str) or not SNAPSHOT_ID.fullmatch(snapshot_id):
        raise ValueError('The recipe export snapshot identifier is invalid.')
    if (not isinstance(photos, dict) or not isinstance(photos.get('recipes'), dict)
            or not isinstance(photos.get('files'), dict)):
        raise ValueError('The recipe export photo index is invalid.')
    directory = Path(directory)
    directory_descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        descriptor = os.open(
            'recipe-records.ndjson', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=directory_descriptor,
        )
        with os.fdopen(descriptor, 'rb') as source:
            before = os.fstat(source.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
                raise ValueError('The recipe record stream is not a regular private file.')
            with _private_text(directory_descriptor, 'recipes.json') as json_file, \
                    _private_text(directory_descriptor, 'recipes.csv') as csv_file:
                header = {'format': 'recipe-records', 'format_version': 1, 'snapshot_id': snapshot_id}
                json_file.write(json.dumps(header, ensure_ascii=False)[:-1] + ', "recipes": [\n')
                csv_writer = csv.writer(csv_file, lineterminator='\r\n')
                csv_writer.writerow(('snapshot_id', *RECIPE_FIELDS))
                count = 0
                last_id = 0
                seen_photos = set()
                while True:
                    line = source.readline(MAX_RECORD_BYTES + 1)
                    if not line:
                        break
                    if len(line) > MAX_RECORD_BYTES:
                        raise ValueError('One recipe record exceeds the 16 MiB export limit.')
                    try:
                        recipe = json.loads(line.decode('utf-8'), object_pairs_hook=_object,
                                            parse_constant=_invalid_constant)
                    except (UnicodeError, json.JSONDecodeError):
                        raise ValueError('The recipe record stream is not valid UTF-8 JSON.') from None
                    _validate_recipe(recipe)
                    if recipe['id'] <= last_id:
                        raise ValueError('Recipe export records are duplicated or out of order.')
                    last_id = recipe['id']
                    _add_photo_files(recipe, photos['recipes'], photos['files'], seen_photos)
                    if count:
                        json_file.write(',\n')
                    json.dump(recipe, json_file, ensure_ascii=False, allow_nan=False)
                    csv_writer.writerow((snapshot_id, *(
                        json.dumps(recipe[field], ensure_ascii=False, allow_nan=False)
                        if field in NESTED_FIELDS else _csv_value(recipe[field])
                        for field in RECIPE_FIELDS
                    )))
                    count += 1
                if seen_photos != set(photos['recipes']):
                    raise ValueError('Recipe exports do not contain every indexed recipe photo.')
                after = os.fstat(source.fileno())
                if (before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns
                        or before.st_ctime_ns != after.st_ctime_ns):
                    raise ValueError('The recipe record stream changed during export.')
                json_file.write('\n]}\n')
                for stream in (json_file, csv_file):
                    stream.flush()
                    os.fsync(stream.fileno())
        return {
            'format_version': 1,
            'recipe_count': count,
            'files': {
                name: _file_metadata(directory_descriptor, name)
                for name in ('recipes.json', 'recipes.csv')
            },
        }
    finally:
        os.close(directory_descriptor)
