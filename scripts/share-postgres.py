#!/usr/bin/env python3
"""Share PostgreSQL data through Git and prepare the local website at startup.

Run from the host with the existing backend and postgres services running.
Shared files are unencrypted and require no sharing key. Startup combines local
recipes with a downloaded copy before selecting it; previous databases remain.
Photo files and Git push/pull are separate from database transfer.
"""

import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parent.parent
PRIVATE = ROOT / "data/database-private"
SHARED = ROOT / "data/shared-database"
PG_MAJOR = 17
EXCLUSIONS = ["public.django_session", "public.authtoken_token"]
SNAPSHOT_NAME = re.compile(r"\d{8}T\d{6}Z_[0-9a-f]{12}")
HEX_DIGEST = re.compile(r"[0-9a-f]{64}")
DATABASE_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}")

# The image copies each application's migration files into /app. Use exactly
# the same relative paths and raw bytes on the host and inside that image.
BACKEND_METADATA = """
import hashlib, json, os
from pathlib import Path
root = Path('/app')
files = {}
for path in sorted(root.glob('*/migrations/*.py')):
    if path.is_symlink() or not path.is_file():
        raise SystemExit('Migration sources must be regular files.')
    files[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
fingerprint = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
print(json.dumps({'engine': os.environ.get('DJANGO_DB_ENGINE', 'sqlite'),
                  'database': os.environ.get('POSTGRES_DB', 'recipes'),
                  'host': os.environ.get('POSTGRES_HOST', 'postgres'),
                  'user': os.environ.get('POSTGRES_USER', 'recipes'),
                  'port': os.environ.get('POSTGRES_PORT', '5432'),
                  'migration_fingerprint': fingerprint, 'migration_count': len(files)}))
"""


class Failure(Exception):
    """A message safe to display without database records or credentials."""


def fail(message):
    raise Failure(message)


def safe_directory(path, create=False):
    """Reject symlinked parents and restrict all task-owned directories."""
    current = ROOT
    for part in path.relative_to(ROOT).parts:
        current = current / part
        if current.is_symlink():
            fail("Database-sharing directories must not be symbolic links.")
        if not current.exists():
            if not create:
                fail("A required database-sharing directory is missing.")
            current.mkdir(mode=0o700)
        if not current.is_dir():
            fail("A database-sharing path is not a directory.")
    if path != ROOT / "data":
        path.chmod(0o700)


def private_file(path):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    return os.fdopen(descriptor, "wb")


def fingerprint():
    files = {}
    for path in sorted((ROOT / "backend").glob("*/migrations/*.py")):
        if path.is_symlink() or not path.is_file():
            fail("Migration sources must be regular files.")
        files[path.relative_to(ROOT / "backend").as_posix()] = digest(path)
    if not files:
        fail("No local backend migration sources were found.")
    encoded = json.dumps(files, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def atomic_json(path, value):
    safe_directory(path.parent, create=True)
    if path.is_symlink() or (path.exists() and not path.is_file()):
        fail("A database-sharing metadata path is not a regular file.")
    descriptor, temporary_name = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write((json.dumps(value, indent=2, sort_keys=True) + "\n").encode())
            stream.flush()
            os.fsync(stream.fileno())
        if path.is_symlink() or (path.exists() and not path.is_file()):
            fail("A database-sharing metadata destination changed; it was not replaced.")
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def startup_state():
    if not PRIVATE.exists() and not PRIVATE.is_symlink():
        return None
    safe_directory(PRIVATE)
    path = PRIVATE / "startup-state.json"
    if path.is_symlink():
        fail("The local startup marker must not be a symbolic link.")
    if not path.exists():
        return None
    if not path.is_file() or path.stat().st_size > 65536:
        fail("The local startup marker is invalid; existing data was preserved.")
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError):
        fail("The local startup marker is invalid; existing data was preserved.")
    if not isinstance(state, dict) or type(state.get("format_version")) is not int or state["format_version"] != 1 or state.get("initialized") is not True:
        fail("The local startup marker has an unsupported format.")
    for key, pattern in (
        ("database", DATABASE_NAME), ("source_snapshot_id", SNAPSHOT_NAME),
        ("computer_id", re.compile(r"[0-9a-f]{32}")),
        ("source_git_revision", re.compile(r"[0-9a-f]{40}|[0-9a-f]{64}")),
    ):
        if not isinstance(state.get(key), str) or not pattern.fullmatch(state[key]):
            fail("The local startup marker contains invalid metadata.")
    try:
        updated_at = datetime.datetime.fromisoformat(state["updated_at_utc"])
    except (KeyError, TypeError, ValueError):
        fail("The local startup marker has an invalid timestamp.")
    if updated_at.utcoffset() != datetime.timedelta(0):
        fail("The local startup marker timestamp must use UTC.")
    return state


def record_initialized(database, manifest):
    previous = startup_state()
    atomic_json(PRIVATE / "startup-state.json", {
        "format_version": 1,
        "initialized": True,
        "computer_id": previous["computer_id"] if previous else secrets.token_hex(16),
        "database": database,
        "source_snapshot_id": manifest["snapshot_id"],
        "source_git_revision": manifest["source_git_revision"],
        "updated_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })


def utc_stamp():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


class Operation:
    def __init__(self, name):
        safe_directory(PRIVATE, create=True)
        self.directory = Path(tempfile.mkdtemp(prefix=name + "-", dir=PRIVATE))
        self.directory.chmod(0o700)
        self.sequence = 0

    def run(self, arguments, *, output=None, input_stream=None):
        self.sequence += 1
        log = self.directory / f"command-{self.sequence:02d}.log"
        with private_file(log) as errors:
            try:
                result = subprocess.run(
                    arguments,
                    cwd=ROOT,
                    stdin=input_stream if input_stream is not None else subprocess.DEVNULL,
                    stdout=output if output is not None else subprocess.PIPE,
                    stderr=errors,
                    check=False,
                )
            except OSError:
                fail("A required command could not start; inspect the private operation directory.")
        if result.returncode != 0:
            fail("A command failed; inspect its private log before retrying. No active database was replaced.")
        return result.stdout

    def postgres(self, tool, *arguments, **kwargs):
        return self.run(
            ["docker", "compose", "exec", "-T", "postgres", tool, *arguments], **kwargs
        )

    def backend(self, expected_fingerprint, from_image=False):
        if from_image:
            command = [
                "docker", "compose", "run", "--rm", "--no-deps", "-T",
                "-e", "DJANGO_DB_ENGINE=postgresql", "--entrypoint", "python",
                "backend", "-c", BACKEND_METADATA,
            ]
        else:
            command = ["docker", "compose", "exec", "-T", "backend", "python", "-c", BACKEND_METADATA]
        raw = self.run(command)
        try:
            metadata = json.loads(raw)
        except (ValueError, TypeError):
            fail("The running backend did not return valid database metadata.")
        if not isinstance(metadata, dict):
            fail("The running backend database metadata is invalid.")
        if metadata.get("engine", "").strip().lower() != "postgresql":
            fail("The running backend must use PostgreSQL before sharing a snapshot.")
        if any(metadata.get(key) != value for key, value in {
            "host": "postgres", "user": "recipes", "port": "5432"
        }.items()):
            fail("The running backend must use this Compose project's internal PostgreSQL connection.")
        database = metadata.get("database")
        if not isinstance(database, str) or not DATABASE_NAME.fullmatch(database):
            fail("The running backend database name is unsupported; review it before proceeding.")
        if (metadata.get("migration_fingerprint") != expected_fingerprint
                or not metadata.get("migration_count")):
            fail("Running backend migrations differ from this checkout; load matching code first.")
        return database

    def postgres_version(self):
        raw = self.postgres(
            "psql", "--no-password", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
            "-U", "recipes", "-d", "postgres", "-c", "SHOW server_version_num",
        )
        try:
            major = int(raw.strip()) // 10000
        except ValueError:
            fail("PostgreSQL did not return a valid server version.")
        if major != PG_MAJOR:
            fail("This sharing workflow requires PostgreSQL 17 on both computers.")
        return major


def records_fingerprint(operation):
    script = ROOT / "scripts/merge-shared-recipes.py"
    if script.is_symlink() or not script.is_file():
        fail("The recipe-sharing helper is missing; no shared files were changed.")
    output = operation.run(["docker", "compose", "exec", "-T", "backend", "python",
                            "-c", script.read_text(encoding="utf-8"), "--fingerprint"])
    value = output.decode("ascii").strip()
    if not HEX_DIGEST.fullmatch(value):
        fail("Could not compare the website's records; no shared files were changed.")
    return value


def export_snapshot(operation):
    migration_hash = fingerprint()
    database = operation.backend(migration_hash)
    major = operation.postgres_version()
    before = records_fingerprint(operation)
    state = startup_state()
    current_pair = [SHARED / "shared-data", SHARED / "manifest.json"]
    if any(path.exists() or path.is_symlink() for path in current_pair):
        current, _ = read_manifest(str(SHARED), check_migrations=False)
        if (state and state["database"] == database
                and state["source_snapshot_id"] == current["snapshot_id"]
                and current["migration_fingerprint"] == migration_hash
                and current.get("records_sha256") == before):
            print("The shared file already contains the current records; no files changed.")
            shutil.rmtree(operation.directory)
            return
    revision = operation.run(["git", "rev-parse", "HEAD"]).decode("ascii").strip()
    if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", revision):
        fail("The source Git revision could not be identified.")
    snapshot_id = utc_stamp() + "_" + secrets.token_hex(6)
    data = operation.directory / "shared-data"
    with private_file(data) as stream:
        operation.postgres(
            "pg_dump", "--no-password", "-U", "recipes", "-d", database, "--format=custom",
            "--no-acl", *["--exclude-table-data=" + table for table in EXCLUSIONS],
            output=stream,
        )
    if data.stat().st_size == 0:
        fail("PostgreSQL produced an empty snapshot; nothing was published.")
    with data.open("rb") as stream:
        if stream.read(5) != b"PGDMP":
            fail("PostgreSQL did not produce the expected shared data format.")
    after = records_fingerprint(operation)
    manifest = {
        "format_version": 2,
        "snapshot_id": snapshot_id,
        "created_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "source_git_revision": revision,
        "migration_fingerprint": migration_hash,
        "postgres_major": major,
        "source_database": database,
        "archive_format": "postgresql-custom",
        "data_sha256": digest(data),
        "data_bytes": data.stat().st_size,
        "excluded_table_data": EXCLUSIONS,
        "media_included": False,
    }
    if before == after:
        manifest["records_sha256"] = after
    staged_manifest = operation.directory / "manifest.json"
    with private_file(staged_manifest) as stream:
        stream.write((json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode())
    safe_directory(SHARED, create=True)
    public_pair = [SHARED / "shared-data", SHARED / "manifest.json"]
    present = [path for path in public_pair if path.exists() or path.is_symlink()]
    if present:
        if len(present) != 2 or any(path.is_symlink() or not path.is_file() for path in present):
            fail("The existing shared data pair is incomplete or unsafe; it was left unchanged.")
    # Mark this source as initialized before publication, so an interrupted
    # export cannot make its next startup import its own just-saved data.
    record_initialized(database, manifest)
    data.replace(public_pair[0])
    # Publish matching metadata last. An import racing this two-file update
    # refuses a checksum mismatch rather than importing incomplete data.
    staged_manifest.replace(public_pair[1])
    # These files belong only to this completed export. Keep the current shared
    # pair, initialization marker and all import receipts outside this tree.
    shutil.rmtree(operation.directory)
    print("Shared data saved: data/shared-database/shared-data")
    print("Git needs that file and data/shared-database/manifest.json. No sharing key is needed.")
    print("Photos are separate; shared data does not include uploaded image files.")


def read_manifest(snapshot_argument, *, check_migrations=True):
    supplied = Path(snapshot_argument)
    if not supplied.is_absolute():
        supplied = ROOT / supplied
    # Resolve lexical '..' without accepting a symlink to a different tree.
    supplied = Path(os.path.abspath(supplied))
    stable = supplied == SHARED
    try:
        relative = supplied.relative_to(SHARED)
    except ValueError:
        fail("Import requires data/shared-database or a supported legacy directory inside it.")
    if not stable and (len(relative.parts) != 1 or not SNAPSHOT_NAME.fullmatch(relative.name)):
        fail("Import requires the shared data directory or a valid legacy backup directory.")
    safe_directory(supplied)
    manifest_path = supplied / "manifest.json"
    data = supplied / "shared-data"
    for path in (manifest_path, data):
        if path.is_symlink() or not path.is_file():
            fail("Snapshot files must be regular files, not symbolic links.")
    if manifest_path.stat().st_size > 65536:
        fail("The snapshot manifest is unexpectedly large.")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError):
        fail("The snapshot manifest is not valid JSON.")
    if not isinstance(manifest, dict):
        fail("The snapshot manifest must be an object.")
    snapshot_id = manifest.get("snapshot_id")
    if not isinstance(snapshot_id, str) or not SNAPSHOT_NAME.fullmatch(snapshot_id):
        fail("The shared data identifier is invalid.")
    if not stable and snapshot_id != relative.name:
        fail("The shared data identifier does not match its directory.")
    fixed = {
        "format_version": 2, "postgres_major": PG_MAJOR,
        "archive_format": "postgresql-custom",
        "excluded_table_data": EXCLUSIONS, "media_included": False,
    }
    if any(manifest.get(key) != value for key, value in fixed.items()):
        fail("The snapshot format, PostgreSQL version, or exclusions are incompatible.")
    if type(manifest.get("format_version")) is not int:
        fail("The snapshot format version must be an integer.")
    if not isinstance(manifest.get("source_database"), str) or not DATABASE_NAME.fullmatch(manifest["source_database"]):
        fail("The snapshot source database name is invalid.")
    revision = manifest.get("source_git_revision")
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", revision):
        fail("The snapshot source Git revision is invalid.")
    try:
        created_at = datetime.datetime.fromisoformat(manifest["created_at_utc"])
    except (KeyError, TypeError, ValueError):
        fail("The snapshot creation timestamp is invalid.")
    if created_at.utcoffset() != datetime.timedelta(0):
        fail("The snapshot creation timestamp must use UTC.")
    for key in ("migration_fingerprint", "data_sha256"):
        if not isinstance(manifest.get(key), str) or not HEX_DIGEST.fullmatch(manifest[key]):
            fail("The snapshot manifest contains an invalid fingerprint or checksum.")
    legacy_hash = manifest.get("legacy_encrypted_sha256")
    if legacy_hash is not None and (not isinstance(legacy_hash, str) or not HEX_DIGEST.fullmatch(legacy_hash)):
        fail("The converted shared data identifier is invalid.")
    record_hash = manifest.get("records_sha256")
    if record_hash is not None and (not isinstance(record_hash, str) or not HEX_DIGEST.fullmatch(record_hash)):
        fail("The shared record comparison is invalid.")
    if (type(manifest.get("data_bytes")) is not int
            or manifest["data_bytes"] != data.stat().st_size
            or manifest["data_bytes"] <= 0
            or digest(data) != manifest["data_sha256"]):
        fail("The shared data size or checksum does not match its manifest.")
    with data.open("rb") as stream:
        if stream.read(5) != b"PGDMP":
            fail("The shared data is not a PostgreSQL export.")
    if check_migrations and manifest["migration_fingerprint"] != fingerprint():
        fail("This checkout has different migrations; use the snapshot's matching code first.")
    return manifest, data


def environment_selection(database, write=False):
    desired = {"DJANGO_DB_ENGINE": "postgresql", "DJANGO_POSTGRES_DB": database}
    for key, value in desired.items():
        if key in os.environ and os.environ[key] != value:
            fail("Unset conflicting exported DJANGO_DB_ENGINE/DJANGO_POSTGRES_DB overrides before import.")
    path = ROOT / ".env"
    if path.is_symlink() or not path.is_file():
        fail("Startup import requires an existing regular, non-symlink .env file.")
    original = path.stat()
    if original.st_uid != os.getuid() or original.st_nlink != 1:
        fail("The local .env must belong to this user and have no hard links.")
    content = path.read_bytes()
    # Editing assignment-shaped lines inside multiline quoted values would risk
    # changing unrelated secrets. Refuse that dotenv form without echoing it.
    for line in content.splitlines():
        quoted = re.match(rb"[ \t]*(?:export[ \t]+)?[A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*([\"'])", line)
        if quoted:
            quote = quoted.group(1)[0]
            escaped = False
            for character in line[quoted.end():]:
                if escaped:
                    escaped = False
                elif character == 92:
                    escaped = True
                elif character == quote:
                    break
            else:
                fail("Startup import requires single-line .env values; multiline quoted values were left unchanged.")
    if not write:
        return
    newline = b"\r\n" if b"\r\n" in content else b"\n"
    output = []
    changed = set()
    for line in content.splitlines(keepends=True):
        match = re.match(rb"[ \t]*(?:export[ \t]+)?(DJANGO_DB_ENGINE|DJANGO_POSTGRES_DB)[ \t]*=", line)
        if match:
            key = match.group(1).decode("ascii")
            if key not in changed:
                output.append((key + "=" + desired[key]).encode("ascii") + newline)
                changed.add(key)
        else:
            output.append(line)
    if output and not output[-1].endswith((b"\n", b"\r")):
        output[-1] += newline
    for key, value in desired.items():
        if key not in changed:
            output.append((key + "=" + value).encode("ascii") + newline)
    descriptor, temporary = tempfile.mkstemp(prefix=".env.database-", dir=ROOT)
    temporary = Path(temporary)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(b"".join(output))
            os.fchmod(stream.fileno(), stat.S_IMODE(original.st_mode))
            stream.flush()
            os.fsync(stream.fileno())
        current = path.stat()
        if path.is_symlink() or (
            current.st_dev, current.st_ino, current.st_mtime_ns, current.st_size
        ) != (original.st_dev, original.st_ino, original.st_mtime_ns, original.st_size):
            fail("The local .env changed during import; selection was not updated.")
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def receipt_path(manifest):
    directory = PRIVATE / "import-receipts"
    safe_directory(directory, create=True)
    return directory / (manifest["snapshot_id"] + ".json")


def prior_import(operation, manifest):
    path = receipt_path(manifest)
    if path.is_symlink():
        fail("Import receipts must not be symbolic links.")
    if not path.exists():
        return None
    if not path.is_file() or path.stat().st_size > 65536:
        fail("The private import receipt is invalid.")
    try:
        receipt = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError):
        fail("The private import receipt is invalid; existing databases were preserved.")
    if not isinstance(receipt, dict) or any(receipt.get(key) != manifest[key] for key in (
        "snapshot_id", "source_git_revision", "migration_fingerprint"
    )) or receipt.get("status") != "restore-complete":
        fail("The private receipt does not match this shared data.")
    if receipt.get("data_sha256") != manifest["data_sha256"]:
        if (not manifest.get("legacy_encrypted_sha256")
                or receipt.get("encrypted_sha256") != manifest["legacy_encrypted_sha256"]):
            fail("The private receipt does not match this shared data's contents.")
    database = receipt.get("restored_database")
    if not isinstance(database, str) or not re.fullmatch(r"recipes_shared_\d{8}t\d{6}z_[0-9a-f]{12}", database):
        fail("The private receipt has an invalid restored database name.")
    raw = operation.postgres(
        "psql", "--no-password", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
        "-U", "recipes", "-d", "postgres", "-c",
        "SELECT 1 FROM pg_database WHERE datname = '" + database + "'",
    )
    if raw.strip() != b"1":
        fail("The previously restored database is missing; no replacement or deletion was attempted.")
    return database


def restore_snapshot(operation, snapshot_argument, *, from_image=False):
    manifest, data = read_manifest(snapshot_argument)
    operation.backend(manifest["migration_fingerprint"], from_image=from_image)
    operation.postgres_version()
    database = prior_import(operation, manifest)
    if database:
        return manifest, database
    plaintext = operation.directory / "shared-data"
    with data.open("rb") as source, private_file(plaintext) as target:
        shutil.copyfileobj(source, target)
    if digest(plaintext) != manifest["data_sha256"]:
        fail("The shared data changed while being copied; no database was created.")
    # A failed createdb never leads to restore: existing databases are refused.
    database = "recipes_shared_" + utc_stamp().lower() + "_" + secrets.token_hex(6)
    operation.postgres(
        "createdb", "--no-password", "-U", "recipes", "--maintenance-db=postgres", "--template=template0",
        "--owner=recipes", "--", database,
    )
    with private_file(operation.directory / "created-database.txt") as stream:
        stream.write((database + "\n").encode("ascii"))
    with plaintext.open("rb") as stream:
        operation.postgres(
            "pg_restore", "--no-password", "-U", "recipes", "-d", database, "--no-owner", "--no-acl",
            "--single-transaction", "--exit-on-error", input_stream=stream,
        )
    with private_file(operation.directory / "restore-complete.txt") as stream:
        stream.write((database + "\n").encode("ascii"))
    receipt = {
        "snapshot_id": manifest["snapshot_id"],
        "source_git_revision": manifest["source_git_revision"],
        "migration_fingerprint": manifest["migration_fingerprint"],
        "data_sha256": manifest["data_sha256"],
        "restored_database": database,
        "status": "restore-complete",
        "completed_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "active_database_selected": False,
    }
    receipt_bytes = (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode()
    metadata_path = operation.directory / "import-metadata.json"
    with private_file(metadata_path) as stream:
        stream.write(receipt_bytes)
        stream.flush()
        os.fsync(stream.fileno())
    # Publish the completed receipt without replacing a concurrently created one.
    os.link(metadata_path, receipt_path(manifest))
    return manifest, database


def import_snapshot(operation, snapshot_argument, startup=False):
    if startup:
        prepare_startup(operation, snapshot_argument, force=True)
        return
    manifest, database = restore_snapshot(operation, snapshot_argument)
    print("Restored into a separate database: " + database)
    print("The website database selection was not changed.")
    print("To combine this copy with the local website, run:")
    print("sh scripts/start.sh --import " + snapshot_argument)
    print("Uploaded photo files must be transferred separately.")


def combine_recipes(operation, local_database, imported_database):
    if local_database == imported_database:
        return
    script = ROOT / "scripts/merge-shared-recipes.py"
    if script.is_symlink() or not script.is_file():
        fail("The recipe-sharing helper is missing; no database was selected.")
    output = operation.run(["docker", "compose", "run", "--rm", "--no-deps", "-T",
                            "-e", "DJANGO_DB_ENGINE=postgresql", "--entrypoint", "python",
                            "backend", "-c", script.read_text(encoding="utf-8"),
                            local_database, imported_database])
    try:
        counts = json.loads(output)
    except (ValueError, UnicodeError):
        fail("The recipe-sharing result was invalid; the previous database is still selected.")
    if (not isinstance(counts, dict)
            or any(type(counts.get(name)) is not int or counts[name] < 0
                   for name in ("users_added", "recipes_added", "reviews_added"))):
        fail("The recipe-sharing result was invalid; the previous database is still selected.")
    print("Retained local recipes alongside downloaded data: " + str(counts["recipes_added"]))


def has_local_recipes(operation, database):
    exists = operation.postgres(
        "psql", "--no-password", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
        "-U", "recipes", "-d", "postgres", "-c",
        "SELECT 1 FROM pg_database WHERE datname = '" + database + "'",
    )
    if exists.strip() != b"1":
        return False
    schema = operation.postgres(
        "psql", "--no-password", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
        "-U", "recipes", "-d", database, "-c",
        "SELECT to_regclass('public.recipes_recipe') IS NOT NULL",
    )
    return schema.strip() == b"t"


def prepare_startup(operation, snapshot_argument=None, *, force=False):
    state = startup_state()
    supplied = str(SHARED) if snapshot_argument is None else snapshot_argument
    if snapshot_argument is None:
        if SHARED.is_symlink():
            fail("The shared data directory must not be a symbolic link.")
        if not SHARED.exists():
            print("No shared data is available; continuing local startup.")
            return
        safe_directory(SHARED)
        if not any(SHARED.iterdir()):
            print("No shared data is available; continuing local startup.")
            return
    manifest, data = read_manifest(supplied, check_migrations=False)
    if state and state["source_snapshot_id"] == manifest["snapshot_id"] and not force:
        print("This computer already has the current shared copy; preserving its local database.")
        return
    if manifest["migration_fingerprint"] != fingerprint():
        fail("The downloaded data has different migrations; use its matching project code first.")
    local_database = operation.backend(manifest["migration_fingerprint"], from_image=True)
    environment_selection(local_database)
    local_ready = has_local_recipes(operation, local_database)
    # Freeze website writes while its local recipes are copied. The launcher
    # starts the backend again after the combined database is selected.
    if local_ready:
        operation.run(["docker", "compose", "stop", "backend"])
    manifest, database = restore_snapshot(operation, supplied, from_image=True)
    if local_ready:
        print("Combining downloaded recipes with this computer's recipes.")
        combine_recipes(operation, local_database, database)
    environment_selection(database, write=True)
    record_initialized(database, manifest)
    print("Shared data is ready; the website will use: " + database)
    print("Previous databases remain stored separately. Uploaded photo files are separate.")


def remove_operation_plaintext(operation):
    path = operation.directory / "shared-data"
    try:
        details = path.lstat()
    except FileNotFoundError:
        return
    if (stat.S_ISREG(details.st_mode) and details.st_uid == os.getuid()
            and details.st_nlink == 1):
        path.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("export", help="Save the database as Git-shareable data without encryption.")
    commands.add_parser("prepare-startup", help="Automatically load shared updates and retain local recipes.")
    importer = commands.add_parser("import", help="Restore into a new database without selecting it.")
    importer.add_argument("snapshot_directory")
    importer.add_argument("--startup", action="store_true", help="Inspect the built image and select the restored database in .env.")
    arguments = parser.parse_args()
    os.umask(0o077)
    operation = None
    try:
        for executable in ("docker", "git"):
            if shutil.which(executable) is None:
                fail("Required host command missing: " + executable)
        operation = Operation(arguments.command)
        if arguments.command == "export":
            export_snapshot(operation)
        elif arguments.command == "prepare-startup":
            prepare_startup(operation)
        else:
            import_snapshot(operation, arguments.snapshot_directory, startup=arguments.startup)
        if arguments.command != "export":
            # The central receipt is a separate hard link outside this tree;
            # removing its operation-side link preserves idempotent reuse.
            shutil.rmtree(operation.directory)
    except (Failure, OSError, ValueError, UnicodeError) as error:
        print(str(error) if isinstance(error, Failure) else "A local file operation failed.", file=sys.stderr)
        if operation is not None:
            print("Private operation files retained: " + str(operation.directory.relative_to(ROOT)), file=sys.stderr)
            print("A failed restore may leave a separate database; it was not selected or deleted.", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Interrupted. Existing databases were preserved; private diagnostic logs may remain.", file=sys.stderr)
        return 130
    finally:
        if operation is not None:
            try:
                remove_operation_plaintext(operation)
            except OSError:
                print("Temporary plaintext could not be removed; check its private operation directory.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
