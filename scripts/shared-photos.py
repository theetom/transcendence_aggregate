"""Carry referenced uploads with shared records; run inside the backend image.

Importing this module only defines standard-library helpers. The host sharing
script also uses its index validator without importing Django or opening files.
"""

import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import stat
import sys
import tarfile
import tempfile


MAX_INDEX_BYTES = 16 * 1024 * 1024
MEDIA_ROOT = Path("/app/media")
CHUNK_BYTES = 1024 * 1024
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
BLOB = re.compile(r"([0-9a-f]{64})\.([a-z0-9]{1,10})\Z")
DATABASE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}\Z")
KINDS = {"recipes": ("RecipeImage", "image"), "profiles": ("UserProfile", "profile_picture")}


class PhotoError(ValueError):
    """An error with a safe message that contains no records or credentials."""


def safe_path(value):
    if not isinstance(value, str) or not value or len(value.encode("utf-8")) > 4096:
        raise ValueError("Invalid photo path.")
    if "\\" in value or any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise ValueError("Invalid photo path.")
    parts = value.split("/")
    if any(part in {"", ".", ".."} for part in parts) or PurePosixPath(value).is_absolute():
        raise ValueError("Invalid photo path.")
    return value


def validate_index(index):
    """Validate the public index without Django, I/O or mutable global state."""
    if not isinstance(index, dict) or set(index) != {"files", "recipes", "profiles"}:
        raise ValueError("Invalid photo index.")
    if any(not isinstance(index[key], dict) for key in index):
        raise ValueError("Invalid photo index.")
    files = index["files"]
    for name, entry in files.items():
        match = BLOB.fullmatch(name) if isinstance(name, str) else None
        if match is None or not isinstance(entry, dict) or set(entry) != {"sha256", "bytes"}:
            raise ValueError("Invalid shared photo metadata.")
        if entry["sha256"] != match.group(1) or type(entry["bytes"]) is not int or entry["bytes"] < 0:
            raise ValueError("Invalid shared photo metadata.")
    used = set()
    originals = {}
    for kind in KINDS:
        for identifier, entry in index[kind].items():
            if (not isinstance(identifier, str) or not re.fullmatch(r"[1-9][0-9]{0,18}", identifier)
                    or int(identifier) > 9223372036854775807):
                raise ValueError("Invalid photo record identifier.")
            if not isinstance(entry, dict) or set(entry) != {"path", "file"}:
                raise ValueError("Invalid photo reference.")
            path = safe_path(entry["path"])
            name = entry["file"]
            if not isinstance(name, str) or name not in files:
                raise ValueError("Missing shared photo metadata.")
            if path in originals and originals[path] != name:
                raise ValueError("Conflicting original photo paths.")
            originals[path] = name
            used.add(name)
    if used != set(files):
        raise ValueError("Unreferenced shared photo files.")
    return index


def index_bytes(index):
    validate_index(index)
    encoded = json.dumps(index, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(encoded) > MAX_INDEX_BYTES:
        raise ValueError("The photo index is too large.")
    return encoded


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate photo index entry.")
        result[key] = value
    return result


def read_index(data):
    if len(data) > MAX_INDEX_BYTES:
        raise ValueError("The photo index is too large.")
    return validate_index(json.loads(data.decode("utf-8"), object_pairs_hook=unique_object))


def directory_flags():
    return os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


def open_root(path):
    path = Path(path)
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError("Invalid media directory.")
    descriptor = os.open("/", directory_flags())
    try:
        for part in path.parts[1:]:
            child = os.open(part, directory_flags(), dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except Exception:
        os.close(descriptor)
        raise


def parent_directory(root_descriptor, relative, *, create=False):
    parts = safe_path(relative).split("/")
    descriptor = os.dup(root_descriptor)
    try:
        for part in parts[:-1]:
            created = False
            if create:
                try:
                    os.mkdir(part, 0o755, dir_fd=descriptor)
                    created = True
                except FileExistsError:
                    pass
            child = os.open(part, directory_flags(), dir_fd=descriptor)
            if created:
                os.fchmod(child, 0o755)
            os.close(descriptor)
            descriptor = child
        return descriptor, parts[-1]
    except Exception:
        os.close(descriptor)
        raise


def open_photo(root_descriptor, relative):
    parent, name = parent_directory(root_descriptor, relative)
    try:
        descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            os.close(descriptor)
            raise ValueError("A photo is not a regular file.")
        return os.fdopen(descriptor, "rb")
    finally:
        os.close(parent)


def signature(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def digest_stream(stream):
    result = hashlib.sha256()
    size = 0
    while True:
        chunk = stream.read(CHUNK_BYTES)
        if not chunk:
            return result.hexdigest(), size
        result.update(chunk)
        size += len(chunk)


def canonical(kind, name):
    return "shared/" + kind + "/" + name


def setup_django(database=None):
    if database is not None:
        if not DATABASE.fullmatch(database):
            raise ValueError("Invalid database name.")
        os.environ["POSTGRES_DB"] = database
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django

    django.setup()


class CheckedReader:
    def __init__(self, stream):
        self.stream = stream
        self.digest = hashlib.sha256()
        self.bytes = 0

    def read(self, size=-1):
        value = self.stream.read(size)
        self.digest.update(value)
        self.bytes += len(value)
        return value


def tar_member(archive, name, size, stream):
    member = tarfile.TarInfo(name)
    member.size = size
    member.mode = 0o644
    member.mtime = 0
    archive.addfile(member, stream)


def export_photos():
    setup_django()
    from django.conf import settings
    from django.db import connections, transaction
    from recipes.models import RecipeImage
    from users.models import UserProfile

    root_descriptor = open_root(settings.MEDIA_ROOT)
    index = {"files": {}, "recipes": {}, "profiles": {}}
    originals = {}
    sources = {}
    try:
        with transaction.atomic():
            with connections["default"].cursor() as cursor:
                cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            for kind, model, field in (("recipes", RecipeImage, "image"), ("profiles", UserProfile, "profile_picture")):
                rows = model.objects.exclude(**{field: ""}).exclude(**{field + "__isnull": True})
                for identifier, path in rows.order_by("pk").values_list("pk", field).iterator():
                    path = safe_path(path)
                    if path not in originals:
                        try:
                            with open_photo(root_descriptor, path) as photo:
                                before = signature(os.fstat(photo.fileno()))
                                checksum, size = digest_stream(photo)
                                if before != signature(os.fstat(photo.fileno())) or size != before[2]:
                                    raise PhotoError("A referenced photo changed during export. Retry after saving finishes.")
                        except FileNotFoundError:
                            raise PhotoError("A referenced recipe or profile photo is missing. Restore it before sharing.") from None
                        suffix = PurePosixPath(path).suffix.lower().lstrip(".")
                        if re.fullmatch(r"[a-z0-9]{1,10}", suffix) is None:
                            suffix = "img"
                        name = checksum + "." + suffix
                        originals[path] = name
                        sources.setdefault(name, (path, before))
                        index["files"][name] = {"sha256": checksum, "bytes": size}
                    index[kind][str(identifier)] = {"path": path, "file": originals[path]}
            encoded = index_bytes(index)
            with tarfile.open(fileobj=sys.stdout.buffer, mode="w|", format=tarfile.USTAR_FORMAT) as archive:
                tar_member(archive, "photo-index.json", len(encoded), io.BytesIO(encoded))
                for name in sorted(index["files"]):
                    path, expected = sources[name]
                    with open_photo(root_descriptor, path) as photo:
                        if signature(os.fstat(photo.fileno())) != expected:
                            raise PhotoError("A referenced photo changed during export. Retry after saving finishes.")
                        reader = CheckedReader(photo)
                        tar_member(archive, "photos/" + name, index["files"][name]["bytes"], reader)
                        if (reader.digest.hexdigest() != index["files"][name]["sha256"]
                                or reader.bytes != index["files"][name]["bytes"]
                                or signature(os.fstat(photo.fileno())) != expected):
                            raise PhotoError("A referenced photo changed during export. Retry after saving finishes.")
    finally:
        os.close(root_descriptor)
        connections.close_all()


def read_exact(stream, size):
    chunks = []
    remaining = size
    while remaining:
        chunk = stream.read(min(remaining, CHUNK_BYTES))
        if not chunk:
            raise ValueError("Incomplete photo archive.")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def archive_header(stream):
    header = read_exact(stream, tarfile.BLOCKSIZE)
    if header == b"\0" * tarfile.BLOCKSIZE:
        if read_exact(stream, tarfile.BLOCKSIZE) != b"\0" * tarfile.BLOCKSIZE:
            raise ValueError("Invalid photo archive ending.")
        while True:
            rest = stream.read(CHUNK_BYTES)
            if not rest:
                return None
            if rest.strip(b"\0"):
                raise ValueError("Unexpected data after the photo archive.")
    member = tarfile.TarInfo.frombuf(header, "utf-8", "strict")
    if not member.isfile() or member.type not in {tarfile.REGTYPE, tarfile.AREGTYPE} or member.size < 0:
        raise ValueError("Photo archives must contain regular files only.")
    return member


def padding(stream, size):
    extra = (-size) % tarfile.BLOCKSIZE
    if extra and read_exact(stream, extra).strip(b"\0"):
        raise ValueError("Invalid photo archive padding.")


def unpack_archive(stream, staging):
    first = archive_header(stream)
    if first is None or first.name != "photo-index.json" or first.size > MAX_INDEX_BYTES:
        raise ValueError("Missing photo index.")
    index = read_index(read_exact(stream, first.size))
    padding(stream, first.size)
    seen = set()
    while True:
        member = archive_header(stream)
        if member is None:
            break
        if not member.name.startswith("photos/"):
            raise ValueError("Unexpected photo archive member.")
        name = member.name[len("photos/"):]
        if name not in index["files"] or name in seen or member.size != index["files"][name]["bytes"]:
            raise ValueError("Invalid photo archive member.")
        checksum = hashlib.sha256()
        remaining = member.size
        with (staging / name).open("xb") as output:
            while remaining:
                chunk = read_exact(stream, min(remaining, CHUNK_BYTES))
                output.write(chunk)
                checksum.update(chunk)
                remaining -= len(chunk)
        if checksum.hexdigest() != index["files"][name]["sha256"]:
            raise ValueError("Shared photo checksum mismatch.")
        padding(stream, member.size)
        seen.add(name)
    if seen != set(index["files"]):
        raise ValueError("Missing shared photo files.")
    return index


def existing_matches(parent, name, metadata):
    try:
        descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    except FileNotFoundError:
        return None
    with os.fdopen(descriptor, "rb") as source:
        if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
            raise ValueError("An existing photo is not a regular file.")
        checksum, size = digest_stream(source)
        return size == metadata["bytes"] and checksum == metadata["sha256"]


def install_file(root_descriptor, path, staged, metadata, *, optional=False):
    parent, name = parent_directory(root_descriptor, path, create=True)
    temporary = ".shared-photo-" + secrets.token_hex(12)
    try:
        matches = existing_matches(parent, name, metadata)
        if matches is True:
            return "reused"
        if matches is False:
            if optional:
                return "skipped"
            raise PhotoError("An existing shared photo has different contents. Existing files were preserved.")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
        with os.fdopen(descriptor, "wb") as output, staged.open("rb") as source:
            while True:
                chunk = source.read(CHUNK_BYTES)
                if not chunk:
                    break
                output.write(chunk)
            output.flush()
            os.fchmod(output.fileno(), 0o644)
            os.fsync(output.fileno())
        try:
            os.link(temporary, name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
        except FileExistsError:
            if existing_matches(parent, name, metadata):
                return "reused"
            if optional:
                return "skipped"
            raise PhotoError("An existing shared photo has different contents. Existing files were preserved.") from None
        return "installed"
    finally:
        try:
            os.unlink(temporary, dir_fd=parent)
        except FileNotFoundError:
            pass
        os.close(parent)


def install_photos(*, originals=False):
    counts = {"photos_installed": 0, "photos_reused": 0, "originals_installed": 0, "originals_reused": 0, "originals_skipped": 0}
    with tempfile.TemporaryDirectory(prefix="shared-photos-") as temporary:
        staging = Path(temporary)
        index = unpack_archive(sys.stdin.buffer, staging)
        root_descriptor = open_root(MEDIA_ROOT)
        try:
            paths = {}
            for kind in KINDS:
                for entry in index[kind].values():
                    paths[canonical(kind, entry["file"])] = entry["file"]
            for path, name in sorted(paths.items()):
                result = install_file(root_descriptor, path, staging / name, index["files"][name])
                counts["photos_" + result] += 1
            if originals:
                original_paths = {entry["path"]: entry["file"] for kind in KINDS for entry in index[kind].values()}
                for path, name in sorted(original_paths.items()):
                    if path in paths:
                        result = "reused" if paths[path] == name else "skipped"
                    else:
                        result = install_file(root_descriptor, path, staging / name, index["files"][name], optional=True)
                    counts["originals_" + result] += 1
        finally:
            os.close(root_descriptor)
    return counts


def relink_photos(database):
    index = read_index(sys.stdin.buffer.read(MAX_INDEX_BYTES + 1))
    setup_django(database)
    from django.db import connections, transaction
    from recipes.models import RecipeImage
    from users.models import UserProfile

    counts = {"recipes_updated": 0, "profiles_updated": 0}
    try:
        if connections["default"].settings_dict["NAME"] != database:
            raise ValueError("The selected database does not match the imported database.")
        with transaction.atomic():
            with connections["default"].cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(42424217)")
            for kind, model, field in (("recipes", RecipeImage, "image"), ("profiles", UserProfile, "profile_picture")):
                for identifier, entry in sorted(index[kind].items()):
                    record = model.objects.select_for_update().filter(pk=int(identifier)).first()
                    if record is None:
                        raise ValueError("A shared photo record is missing.")
                    current = getattr(record, field).name or ""
                    destination = canonical(kind, entry["file"])
                    if current == destination:
                        continue
                    if current != entry["path"]:
                        raise ValueError("A shared photo reference changed before installation.")
                    changed = model.objects.filter(pk=record.pk, **{field: current}).update(**{field: destination})
                    if changed != 1:
                        raise ValueError("A shared photo reference could not be updated.")
                    counts[kind + "_updated"] += 1
        return counts
    finally:
        connections.close_all()


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["export"]:
            export_photos()
        elif sys.argv[1:] in (["install"], ["install", "--originals"]):
            print(json.dumps(install_photos(originals="--originals" in sys.argv[1:]), sort_keys=True))
        elif len(sys.argv) == 3 and sys.argv[1] == "relink":
            print(json.dumps(relink_photos(sys.argv[2]), sort_keys=True))
        else:
            raise ValueError("Expected export, install [--originals], or relink DATABASE.")
    except PhotoError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Could not prepare shared photos. Existing local records and photo files were preserved.", file=sys.stderr)
        sys.exit(1)
