"""Portable, bounded recipe files for the private website transfer controls.

Only caller-selected owned recipes are passed to encode_recipes(). Uploaded
files contain contents and photos, never ownership or moderation instructions.
decode_recipes() validates but does not save; its caller owns successful photo
buffers and must close them after preview or import.
"""

import base64
import binascii
import csv
import io
import json
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import serializers

from .serializers import RecipeDetailedSerializer


MAX_RECIPES = 25
MAX_TRANSFER_BYTES = 20 * 1024 * 1024
MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_PHOTO_BASE64 = ((MAX_PHOTO_BYTES + 2) // 3) * 4
MAX_INGREDIENTS = 100
MAX_CATEGORIES = 50
MAX_STEPS = 200
FORMAT = 'recipe-transfer'
FORMAT_VERSION = 1
CONTENT_FIELDS = ('title', 'description', 'ingredients', 'categories', 'steps')
RECORD_FIELDS = (*CONTENT_FIELDS, 'images')
NESTED_FIELDS = ('ingredients', 'categories', 'steps', 'images')
CSV_FIELDS = ('format_version', *RECORD_FIELDS)
IMAGE_FORMATS = {
    'JPEG': ('image/jpeg', '.jpg'),
    'PNG': ('image/png', '.png'),
    'GIF': ('image/gif', '.gif'),
    'WEBP': ('image/webp', '.webp'),
}
IMAGE_TYPES = {item[0] for item in IMAGE_FORMATS.values()}
# CSV's parser limit is process-wide. The same explicit cap applies to every
# transfer body and output, so no field is permitted a larger allocation.
csv.field_size_limit(MAX_TRANSFER_BYTES)


def _error(message):
    raise serializers.ValidationError({'error': message})


def _object(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise ValueError('Duplicate JSON fields.')
        result[name] = value
    return result


def _constant(value):
    raise ValueError('Non-finite JSON numbers are not supported.')


def _json(value):
    return json.loads(value, object_pairs_hook=_object, parse_constant=_constant)


def _dump(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


def _format(format_name):
    if format_name not in ('json', 'csv'):
        _error('Choose a JSON or CSV recipe file downloaded from Recipe data.')
    return format_name


def _title(value):
    if not isinstance(value, dict) or not isinstance(value.get('title'), str):
        return ''
    return ' '.join(value['title'].split())[:100].encode('utf-8', errors='replace').decode('utf-8')


def _valid_text(value):
    try:
        value.encode('utf-8')
    except UnicodeError:
        return False
    return True


def _row_error(number, record, errors):
    return {'row': number, 'title': _title(record), 'errors': errors}


def _csv_guard(value):
    return (value.startswith("'")
            or value.lstrip().startswith(('=', '+', '-', '@'))
            or value.startswith(('\r', '\n', '\t')))


def _csv_encode(value):
    return "'" + value if _csv_guard(value) else value


def _csv_decode(value):
    # Doubling an original leading apostrophe makes escaping reversible.
    return value[1:] if value.startswith("'") and _csv_guard(value[1:]) else value


def _structure(record):
    if not isinstance(record, dict) or set(record) != set(RECORD_FIELDS):
        raise serializers.ValidationError({
            'non_field_errors': ['Each recipe must contain only title, description, ingredients, categories, steps and images.'],
        })
    errors = {}
    for name in ('title', 'description'):
        if not isinstance(record[name], str):
            errors[name] = ['Use text for this field.']
        elif not _valid_text(record[name]):
            errors[name] = ['Use valid Unicode text.']
    if isinstance(record['title'], str) and len(record['title'].strip()) > 100:
        errors['title'] = ['Use at most 100 characters.']
    shapes = {
        'ingredients': {'name': str, 'quantity': str, 'unit': str},
        'categories': {'name': str},
        'steps': {'step_number': int, 'instruction': str},
        'images': {'content_type': str, 'data': str},
    }
    for field, shape in shapes.items():
        values = record[field]
        if not isinstance(values, list):
            errors[field] = ['Use a list for this field.']
            continue
        limit = {'ingredients': MAX_INGREDIENTS, 'categories': MAX_CATEGORIES, 'steps': MAX_STEPS}.get(field)
        if limit is not None and len(values) > limit:
            errors[field] = ['Use at most ' + str(limit) + ' ' + field + ' per recipe.']
            continue
        if field == 'images' and not 1 <= len(values) <= 2:
            errors[field] = ['Each recipe needs one or two photos.']
            continue
        item_errors = {}
        for number, value in enumerate(values, start=1):
            if not isinstance(value, dict) or set(value) != set(shape):
                item_errors[str(number)] = ['Each item must contain exactly: ' + ', '.join(shape) + '.']
            elif any(type(value[name]) is not expected for name, expected in shape.items()):
                item_errors[str(number)] = ['An item contains a field with the wrong type.']
            else:
                item_issues = {
                    name: ['Use valid Unicode text.']
                    for name, expected in shape.items()
                    if expected is str and not _valid_text(value[name])
                }
                item_issues.update({
                    name: ['Use at most ' + str(limit) + ' characters.']
                    for name, limit in (('name', 100), ('quantity', 50), ('unit', 50))
                    if name in value and len(value[name].strip()) > limit
                })
                if item_issues:
                    item_errors[str(number)] = item_issues
        if item_errors:
            errors[field] = item_errors
    if errors:
        raise serializers.ValidationError(errors)


def _photo(raw, expected_type=None):
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_PHOTO_BYTES:
        raise serializers.ValidationError('Each photo must be nonempty and at most 5 MiB.')
    upload = SimpleUploadedFile('recipe-photo.jpg', raw, content_type='application/octet-stream')
    try:
        validated = serializers.ImageField(allow_empty_file=False).run_validation(upload)
        image = getattr(validated, 'image', None)
        actual = IMAGE_FORMATS.get(getattr(image, 'format', None))
        if image is not None:
            image.close()
        if actual is None:
            raise serializers.ValidationError('Photos must be JPEG, PNG, GIF or WebP.')
        mime, extension = actual
        if expected_type is not None and expected_type != mime:
            raise serializers.ValidationError('The photo type does not match its contents.')
        validated.name = uuid4().hex + extension
        validated.content_type = mime
        validated.seek(0)
        return validated
    except BaseException:
        upload.close()
        raise


def _photos(values):
    if not 1 <= len(values) <= 2:
        raise serializers.ValidationError({'images': ['Each recipe needs one or two photos.']})
    photos = []
    errors = {}
    try:
        for number, value in enumerate(values, start=1):
            try:
                if value['content_type'] not in IMAGE_TYPES:
                    raise serializers.ValidationError('Photos must be JPEG, PNG, GIF or WebP.')
                if not value['data'] or len(value['data']) > MAX_PHOTO_BASE64:
                    raise serializers.ValidationError('Each photo must be nonempty and at most 5 MiB.')
                try:
                    raw = base64.b64decode(value['data'], validate=True)
                except (ValueError, binascii.Error):
                    raise serializers.ValidationError('The photo data is not valid base64.') from None
                photos.append(_photo(raw, value['content_type']))
            except serializers.ValidationError as error:
                errors[str(number)] = error.detail
        if errors:
            raise serializers.ValidationError({'images': errors})
        return photos
    except BaseException:
        for photo in photos:
            photo.close()
        raise


def _prepare(record):
    _structure(record)
    serializer = RecipeDetailedSerializer(data={name: record[name] for name in CONTENT_FIELDS})
    errors = {} if serializer.is_valid() else dict(serializer.errors)
    photos = []
    try:
        try:
            photos = _photos(record['images'])
        except serializers.ValidationError as error:
            errors.update(error.detail)
        if errors:
            raise serializers.ValidationError(errors)
        return serializer, photos
    except BaseException:
        for photo in photos:
            photo.close()
        raise


def _read_json(text):
    try:
        envelope = _json(text)
    except (ValueError, RecursionError):
        _error('The JSON file could not be read. Check its structure and unique field names.')
    if (not isinstance(envelope, dict)
            or set(envelope) != {'format', 'format_version', 'recipes'}
            or envelope.get('format') != FORMAT
            or type(envelope.get('format_version')) is not int
            or envelope['format_version'] != FORMAT_VERSION
            or not isinstance(envelope.get('recipes'), list)):
        _error('Choose a JSON recipe file downloaded from Recipe data.')
    records = envelope['recipes']
    if not 1 <= len(records) <= MAX_RECIPES:
        _error('A recipe file must contain between 1 and 25 recipes.')
    return list(enumerate(records, start=1)), []


def _read_csv(text):
    records = []
    errors = []
    try:
        reader = csv.reader(io.StringIO(text, newline=''), strict=True)
        if next(reader, None) != list(CSV_FIELDS):
            _error('Choose a CSV recipe file downloaded from Recipe data. Its column names and order must be unchanged.')
        for number, cells in enumerate(reader, start=1):
            if number > MAX_RECIPES:
                _error('A recipe file must contain between 1 and 25 recipes.')
            if len(cells) != len(CSV_FIELDS):
                errors.append(_row_error(number, {}, {'non_field_errors': ['The number of columns does not match the header.']}))
                continue
            values = dict(zip(CSV_FIELDS, cells))
            record = {name: _csv_decode(values[name]) for name in ('title', 'description')}
            row_errors = {}
            if values['format_version'] != str(FORMAT_VERSION):
                row_errors['format_version'] = ['The recipe file version is unsupported.']
            for name in NESTED_FIELDS:
                try:
                    record[name] = _json(values[name])
                except (ValueError, RecursionError):
                    row_errors[name] = ['Use a valid JSON list in this column.']
            if row_errors:
                errors.append(_row_error(number, record, row_errors))
            else:
                records.append((number, record))
    except csv.Error:
        _error('The CSV file could not be read. Check quoted fields and columns.')
    if not records and not errors:
        _error('A recipe file must contain between 1 and 25 recipes.')
    return records, errors


def decode_recipes(raw, format_name):
    """Return unsaved valid serializers and seekable validated photo buffers."""
    _format(format_name)
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_TRANSFER_BYTES:
        _error('Choose a nonempty recipe file up to 20 MiB.')
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeError:
        _error('Recipe files must use UTF-8 text encoding.')
    records, errors = _read_json(text) if format_name == 'json' else _read_csv(text)
    prepared = []
    try:
        for number, record in records:
            try:
                prepared.append(_prepare(record))
            except serializers.ValidationError as error:
                errors.append(_row_error(number, record, error.detail))
        if errors:
            raise serializers.ValidationError({
                'error': 'No recipes were imported. Correct the listed rows and validate the file again.',
                'rows': sorted(errors, key=lambda item: item['row']),
            })
        return prepared
    except BaseException:
        for unused_serializer, photos in prepared:
            for photo in photos:
                photo.close()
        raise


def _record(recipe):
    record = {
        'title': recipe.title,
        'description': recipe.description,
        'ingredients': [
            {'name': item.ingredient.name, 'quantity': item.quantity, 'unit': item.unit}
            for item in sorted(recipe.recipe_ingredients.all(), key=lambda item: item.pk)
        ],
        'categories': [
            {'name': item.name} for item in sorted(recipe.categories.all(), key=lambda item: item.pk)
        ],
        'steps': [
            {'step_number': item.step_number, 'instruction': item.instruction}
            for item in sorted(recipe.steps.all(), key=lambda item: (item.step_number, item.pk))
        ],
        'images': [],
    }
    images = list(recipe.images.all())
    if not 1 <= len(images) <= 2:
        raise serializers.ValidationError({'images': ['Add one or two photos before downloading this recipe.']})
    for image in sorted(images, key=lambda item: item.pk):
        try:
            with image.image.open('rb') as source:
                raw = source.read(MAX_PHOTO_BYTES + 1)
        except (OSError, ValueError):
            raise serializers.ValidationError({'images': ['A recipe photo could not be read. Check the recipe before downloading.']}) from None
        try:
            upload = _photo(raw)
        except serializers.ValidationError as error:
            raise serializers.ValidationError({'images': error.detail}) from None
        try:
            record['images'].append({
                'content_type': upload.content_type,
                'data': base64.b64encode(raw).decode('ascii'),
            })
        finally:
            upload.close()
    # Do not return an export that the normal recipe rules would reject later.
    _structure(record)
    serializer = RecipeDetailedSerializer(data={name: record[name] for name in CONTENT_FIELDS})
    if not serializer.is_valid():
        raise serializers.ValidationError(serializer.errors)
    return record


def _write(output, data):
    if output.tell() + len(data) > MAX_TRANSFER_BYTES:
        _error('The selected recipes exceed 20 MiB including photos. Select fewer recipes and download again.')
    output.write(data)


def encode_recipes(recipes, format_name):
    """Encode one selected batch, preserving contents and embedding real photos."""
    _format(format_name)
    output = io.BytesIO()
    if format_name == 'json':
        _write(output, b'{"format":"recipe-transfer","format_version":1,"recipes":[')
    else:
        header = io.StringIO(newline='')
        csv.writer(header, lineterminator='\r\n').writerow(CSV_FIELDS)
        _write(output, header.getvalue().encode('utf-8'))
    count = 0
    for recipe in recipes:
        count += 1
        if count > MAX_RECIPES:
            _error('Select between 1 and 25 recipes to download.')
        try:
            record = _record(recipe)
        except serializers.ValidationError as error:
            raise serializers.ValidationError({
                'error': 'A selected recipe could not be downloaded. Check its listed fields.',
                'rows': [_row_error(count, {'title': recipe.title}, error.detail)],
            }) from None
        if format_name == 'json':
            _write(output, ((',' if count > 1 else '') + _dump(record)).encode('utf-8'))
        else:
            row = io.StringIO(newline='')
            csv.writer(row, lineterminator='\r\n').writerow((
                FORMAT_VERSION, *(
                    _dump(record[name]) if name in NESTED_FIELDS else _csv_encode(record[name])
                    for name in RECORD_FIELDS
                ),
            ))
            _write(output, row.getvalue().encode('utf-8'))
    if not count:
        _error('Select between 1 and 25 recipes to download.')
    if format_name == 'json':
        _write(output, b']}\n')
    return output.getvalue()
