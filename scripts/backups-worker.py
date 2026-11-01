"""Private dated PostgreSQL/media backups for the Compose backup service.

The daemon never controls Docker or the website process. A synchronized
PostgreSQL snapshot and short-lived photo-reference table locks keep database
records and copied media consistent. Restore always creates a separate database;
only the host recovery wrapper can explicitly select it for the website.
"""

import argparse
from contextlib import contextmanager
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import secrets
import select
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time


BACKUPS = Path('/backups')
MEDIA = Path('/media')
SCHEMA = Path('/app/schema')
BACKUP_ID = re.compile(r'[0-9]{8}T[0-9]{6}Z_[0-9a-f]{12}\Z')
DATABASE = re.compile(r'[A-Za-z_][A-Za-z0-9_]{0,62}\Z')
DIGEST = re.compile(r'[0-9a-f]{64}\Z')
SNAPSHOT = re.compile(r'[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+\Z')
MAX_METADATA = 17 * 1024 * 1024
JOB_SECONDS = 300
HEARTBEAT_SECONDS = 30
HEALTH_GRACE_SECONDS = 300
POSTGRES_MAJOR = 17
PHOTO = None


class BackupError(Exception):
    """A credential-free operator message safe for logs."""


def fail(message):
    raise BackupError(message)


def now():
    return datetime.datetime.now(datetime.timezone.utc)


def timestamp(value=None):
    return (value or now()).isoformat()


def utc_stamp(value=None):
    return (value or now()).strftime('%Y%m%dT%H%M%SZ')


def parse_time(value):
    if not isinstance(value, str):
        fail('Backup metadata has an invalid timestamp.')
    try:
        result = datetime.datetime.fromisoformat(value)
    except ValueError:
        fail('Backup metadata has an invalid timestamp.')
    if result.utcoffset() != datetime.timedelta(0):
        fail('Backup timestamps must use UTC.')
    return result


def unique_object(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            fail('Backup metadata contains duplicate fields.')
        result[name] = value
    return result


def invalid_constant(value):
    fail('Backup metadata contains an invalid number.')


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, indent=2) + '\n').encode('utf-8')


def read_json(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_METADATA:
        fail('Backup metadata is missing, unsafe or too large.')
    with path.open('rb') as source:
        before = os.fstat(source.fileno())
        data = source.read(MAX_METADATA + 1)
        after = os.fstat(source.fileno())
    if (not stat.S_ISREG(before.st_mode) or len(data) > MAX_METADATA
            or file_signature(before) != file_signature(after)):
        fail('Backup metadata changed while being read.')
    try:
        return json.loads(data.decode('utf-8'), object_pairs_hook=unique_object, parse_constant=invalid_constant)
    except (UnicodeError, ValueError, RecursionError):
        fail('Backup metadata is not valid UTF-8 JSON.')


def file_signature(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def photo_tools():
    global PHOTO
    if PHOTO is None:
        PHOTO = runpy.run_path('/app/shared-photos.py')
    return PHOTO


def private_binary(path):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    return os.fdopen(descriptor, 'wb')


def ensure_storage():
    if BACKUPS.is_symlink() or not BACKUPS.is_dir():
        fail('The private backup directory is unavailable.')
    descriptor = photo_tools()['open_root'](BACKUPS)
    return descriptor


@contextmanager
def storage_lock(exclusive):
    # Lock the mounted directory itself so read-only recovery mounts can share
    # the same lock without creating a lock file or bypassing retention guards.
    descriptor = ensure_storage()
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        yield descriptor
    finally:
        os.close(descriptor)


def atomic_health(value):
    target = BACKUPS / 'health.json'
    if target.is_symlink() or (target.exists() and not target.is_file()):
        fail('The backup health destination is unsafe.')
    descriptor, name = tempfile.mkstemp(prefix='.health-', dir=BACKUPS)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(json_bytes(value))
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def setting(name, default, minimum, maximum):
    raw = os.environ.get(name, str(default))
    if not raw.isdecimal() or not minimum <= int(raw) <= maximum:
        fail('The backup schedule or retention setting is invalid.')
    return int(raw)


def config():
    database = os.environ.get('PGDATABASE', 'recipes')
    if not DATABASE.fullmatch(database):
        fail('The selected backup database name is invalid.')
    return {
        'database': database,
        'interval': setting('BACKUP_INTERVAL_SECONDS', 86400, 60, 31 * 86400),
        'keep': setting('BACKUP_KEEP_COUNT', 7, 1, 30),
    }


def pg_environment(database):
    if not DATABASE.fullmatch(database):
        fail('The database name is invalid.')
    if (os.environ.get('PGHOST', 'postgres') != 'postgres'
            or os.environ.get('PGPORT', '5432') != '5432'
            or os.environ.get('PGUSER', 'recipes') != 'recipes'
            or not os.environ.get('PGPASSWORD')):
        fail('The internal PostgreSQL backup connection is not configured.')
    result = os.environ.copy()
    result.update(PGHOST='postgres', PGPORT='5432', PGUSER='recipes', PGDATABASE=database,
                  PGCONNECT_TIMEOUT='5', PGAPPNAME='recipe-backups')
    return result


def remaining(deadline):
    result = deadline - time.monotonic()
    if result <= 0:
        fail('The backup operation exceeded its time limit.')
    return result


def pg_command(tool, arguments, *, database, deadline, output=None, input_stream=None):
    try:
        result = subprocess.run(
            [tool, '--no-password', *arguments], env=pg_environment(database),
            stdin=input_stream if input_stream is not None else subprocess.DEVNULL,
            stdout=output if output is not None else subprocess.PIPE,
            stderr=subprocess.PIPE, timeout=remaining(deadline), check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        fail('A PostgreSQL backup or recovery command could not complete.')
    if result.returncode != 0:
        fail('A PostgreSQL backup or recovery command failed; existing databases were not replaced.')
    return result.stdout


def psql(sql, *, database, deadline):
    return pg_command('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql],
                      database=database, deadline=deadline)


def postgres_version(deadline):
    # A real disaster may remove PGDATABASE. Maintenance postgres must suffice.
    raw = psql('SHOW server_version_num', database='postgres', deadline=deadline)
    try:
        major = int(raw.strip()) // 10000
    except ValueError:
        fail('PostgreSQL did not return a valid server version.')
    if major != POSTGRES_MAJOR:
        fail('Backup and recovery require PostgreSQL 17.')


def local_schema():
    files = {}
    names = []
    for path in sorted(SCHEMA.glob('*/migrations/*.py')):
        if path.is_symlink() or not path.is_file():
            fail('Backup migration sources must be regular files.')
        relative = path.relative_to(SCHEMA).as_posix()
        app = path.parent.parent.name
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', app):
            fail('Backup migration sources contain an invalid application name.')
        files[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
        if path.name != '__init__.py':
            names.append([app, path.stem])
    if not files or not names:
        fail('Backup migration sources are missing.')
    fingerprint = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return fingerprint, sorted(names)


def snapshot_query(schema_names):
    apps = sorted({app for app, unused_name in schema_names})
    # Names came from validated image application paths, never input SQL.
    literals = ','.join("'" + app + "'" for app in apps)
    return """
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '310s';
LOCK TABLE public.recipes_recipeimage, public.users_userprofile IN SHARE MODE;
SELECT json_build_object(
  'snapshot_id', pg_export_snapshot(),
  'postgres_major', current_setting('server_version_num')::integer / 10000,
  'recipe_count', (SELECT count(*) FROM public.recipes_recipe),
  'schema_migrations', COALESCE((SELECT json_agg(json_build_array(app, name) ORDER BY app, name)
      FROM public.django_migrations WHERE app IN (""" + literals + """)), '[]'::json),
  'photos', COALESCE((SELECT json_agg(path ORDER BY path) FROM (
      SELECT image AS path FROM public.recipes_recipeimage WHERE image IS NOT NULL AND image <> ''
      UNION
      SELECT profile_picture AS path FROM public.users_userprofile
          WHERE profile_picture IS NOT NULL AND profile_picture <> ''
  ) AS refs), '[]'::json)
);
"""


class DatabaseSnapshot:
    def __init__(self, database, schema_names, deadline):
        self.database = database
        self.schema_names = schema_names
        self.deadline = deadline
        self.process = None
        self.buffer = b''

    def __enter__(self):
        try:
            self.process = subprocess.Popen(
                ['psql', '--no-password', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
                env=pg_environment(self.database), stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            )
            self.process.stdin.write(snapshot_query(self.schema_names).encode('utf-8'))
            self.process.stdin.flush()
            line = self.read_line()
            value = json.loads(line.decode('utf-8'), object_pairs_hook=unique_object,
                               parse_constant=invalid_constant)
            if (not isinstance(value, dict)
                    or set(value) != {'snapshot_id', 'postgres_major', 'recipe_count', 'schema_migrations', 'photos'}
                    or not isinstance(value['snapshot_id'], str) or not SNAPSHOT.fullmatch(value['snapshot_id'])
                    or type(value['postgres_major']) is not int or value['postgres_major'] != POSTGRES_MAJOR
                    or type(value['recipe_count']) is not int or value['recipe_count'] < 0
                    or value['schema_migrations'] != self.schema_names
                    or not isinstance(value['photos'], list)):
                fail('The selected database migrations or snapshot metadata do not match this backup image.')
            paths = value['photos']
            if len(paths) != len(set(paths)):
                fail('The database returned duplicate backup photo references.')
            for path in paths:
                photo_tools()['safe_path'](path)
            return value
        except (OSError, ValueError, UnicodeError, RecursionError, TypeError):
            self.close()
            fail('A consistent database/photo snapshot could not be opened.')
        except BaseException:
            self.close()
            raise

    def read_line(self):
        while b'\n' not in self.buffer:
            ready, unused_write, unused_error = select.select(
                [self.process.stdout], [], [], min(10, remaining(self.deadline)),
            )
            if not ready:
                fail('The database snapshot did not become ready in time.')
            block = os.read(self.process.stdout.fileno(), 65536)
            if not block:
                fail('The consistent database snapshot could not be opened.')
            self.buffer += block
            if len(self.buffer) > MAX_METADATA:
                fail('The database photo index is too large for a backup.')
        return self.buffer.split(b'\n', 1)[0]

    def close(self):
        process = self.process
        if process is None:
            return
        self.process = None
        try:
            if process.poll() is None:
                process.stdin.write(b'ROLLBACK;\n')
                process.stdin.flush()
        except (OSError, ValueError):
            pass
        finally:
            if process.stdin:
                try:
                    process.stdin.close()
                except OSError:
                    pass
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if process.stdout:
            process.stdout.close()

    def __exit__(self, unused_type, unused_value, unused_traceback):
        self.close()


def inspect_file(path, *, magic=False, deadline=None):
    if path.is_symlink() or not path.is_file():
        fail('A backup file is missing or unsafe.')
    with path.open('rb') as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode):
            fail('A backup file is not regular.')
        if magic and stream.read(5) != b'PGDMP':
            fail('The backup is not a PostgreSQL archive.')
        stream.seek(0)
        checksum = hashlib.sha256()
        size = 0
        while True:
            if deadline is not None:
                remaining(deadline)
            block = stream.read(1024 * 1024)
            if not block:
                break
            checksum.update(block)
            size += len(block)
        after = os.fstat(stream.fileno())
    if file_signature(before) != file_signature(after) or size != before.st_size:
        fail('A backup file changed while being checked.')
    return {'bytes': size, 'sha256': checksum.hexdigest()}


def metadata_entry(value, *, allow_empty):
    return (isinstance(value, dict) and set(value) == {'bytes', 'sha256'}
            and type(value.get('bytes')) is int and value['bytes'] >= (0 if allow_empty else 1)
            and isinstance(value.get('sha256'), str) and DIGEST.fullmatch(value['sha256']))


def manifest_metadata(directory, *, expected_schema=None):
    if directory.is_symlink() or not directory.is_dir() or not BACKUP_ID.fullmatch(directory.name):
        fail('Choose a complete dated backup identifier.')
    value = read_json(directory / 'manifest.json')
    keys = {'format_version', 'backup_id', 'created_at_utc', 'completed_at_utc', 'postgres_major',
            'source_database', 'schema_fingerprint', 'schema_migrations', 'recipe_count', 'photo_count',
            'dump', 'photos'}
    if (not isinstance(value, dict) or set(value) != keys
            or type(value.get('format_version')) is not int or value['format_version'] != 1
            or value.get('backup_id') != directory.name
            or type(value.get('postgres_major')) is not int or value['postgres_major'] != POSTGRES_MAJOR
            or not isinstance(value.get('source_database'), str) or not DATABASE.fullmatch(value['source_database'])
            or not isinstance(value.get('schema_fingerprint'), str) or not DIGEST.fullmatch(value['schema_fingerprint'])
            or type(value.get('recipe_count')) is not int or value['recipe_count'] < 0
            or type(value.get('photo_count')) is not int or value['photo_count'] < 0
            or not metadata_entry(value.get('dump'), allow_empty=False)
            or not isinstance(value.get('photos'), dict)
            or value['photo_count'] != len(value['photos'])
            or not isinstance(value.get('schema_migrations'), list)):
        fail('The backup manifest has an unsupported or invalid structure.')
    pairs = value['schema_migrations']
    if (any(not isinstance(pair, list) or len(pair) != 2
            or any(not isinstance(item, str) or not item for item in pair) for pair in pairs)
            or pairs != sorted(pairs) or len({tuple(pair) for pair in pairs}) != len(pairs)):
        fail('The backup migration metadata is invalid.')
    created = parse_time(value['created_at_utc'])
    completed = parse_time(value['completed_at_utc'])
    if (created > completed or completed > now() + datetime.timedelta(seconds=60)
            or utc_stamp(created) != directory.name.split('_')[0]):
        fail('The backup timestamps do not match its identifier.')
    for path, entry in value['photos'].items():
        photo_tools()['safe_path'](path)
        if not metadata_entry(entry, allow_empty=True):
            fail('The backup photo metadata is invalid.')
    if expected_schema is not None:
        fingerprint, names = expected_schema
        if value['schema_fingerprint'] != fingerprint or pairs != names:
            fail('This backup needs its matching project code/migrations before recovery.')
    return value


def verify_files(directory, manifest, *, deadline=None):
    entries = list(directory.iterdir())
    if {path.name for path in entries} != {'manifest.json', 'database.dump', 'photos'}:
        fail('The backup contains unexpected or missing files.')
    if any(path.is_symlink() for path in entries):
        fail('The backup contains a symbolic link.')
    if inspect_file(directory / 'database.dump', magic=True, deadline=deadline) != manifest['dump']:
        fail('The database archive checksum or size does not match.')
    photos = directory / 'photos'
    if photos.is_symlink() or not photos.is_dir():
        fail('The backup photo directory is missing or unsafe.')
    found = set()
    for parent, directories, files in os.walk(photos, followlinks=False):
        for name in directories:
            if (Path(parent) / name).is_symlink():
                fail('The backup contains a symbolic photo directory.')
        for name in files:
            path = Path(parent) / name
            relative = path.relative_to(photos).as_posix()
            if relative not in manifest['photos'] or inspect_file(path, deadline=deadline) != manifest['photos'][relative]:
                fail('A backup photo checksum, size or path does not match.')
            found.add(relative)
    if found != set(manifest['photos']):
        fail('A referenced backup photo is missing.')


def complete_backups(*, schema=None, database=None, verify=False, deadline=None):
    result = []
    for directory in BACKUPS.iterdir():
        if not BACKUP_ID.fullmatch(directory.name) or directory.is_symlink() or not directory.is_dir():
            continue
        try:
            manifest = manifest_metadata(directory, expected_schema=schema)
            if database is not None and manifest['source_database'] != database:
                continue
            if verify:
                verify_files(directory, manifest, deadline=deadline)
            result.append((parse_time(manifest['completed_at_utc']), directory.name, manifest))
        except (BackupError, OSError, ValueError, TypeError):
            # Unknown/corrupt directories are never retention-deleted.
            continue
    return sorted(result, key=lambda item: (item[0], item[1]))


def backup_signature(directory):
    """Cache only unchanged, non-symlink backup trees between full checks."""
    result = []
    for parent, directories, files in os.walk(directory, followlinks=False):
        for name in sorted(['.', *directories, *files]):
            path = Path(parent) if name == '.' else Path(parent) / name
            details = path.lstat()
            if not (stat.S_ISREG(details.st_mode) or stat.S_ISDIR(details.st_mode)):
                fail('The backup contains an unsafe file or symbolic link.')
            result.append((path.relative_to(directory).as_posix(), file_signature(details)))
    if not result:
        fail('The completed backup directory is unavailable.')
    return tuple(sorted(result))


def checked_latest(settings, schema, cached):
    completed = complete_backups(schema=schema, database=settings['database'])
    if not completed:
        return None, None
    unused_time, identifier, manifest = completed[-1]
    directory = BACKUPS / identifier
    try:
        before = backup_signature(directory)
        if cached != (identifier, before):
            verify_backup(identifier, schema, deadline=time.monotonic() + JOB_SECONDS)
            if backup_signature(directory) != before:
                fail('The newest backup changed while being verified.')
        return manifest, (identifier, before)
    except (BackupError, OSError, ValueError, TypeError):
        # A recent manifest alone must not suppress a fresh backup after damage.
        return None, None


def copy_photo(root_descriptor, relative, destination, deadline):
    remaining(deadline)
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with photo_tools()['open_photo'](root_descriptor, relative) as source, private_binary(destination) as target:
        before = os.fstat(source.fileno())
        digest = hashlib.sha256()
        size = 0
        while True:
            remaining(deadline)
            block = source.read(1024 * 1024)
            if not block:
                break
            target.write(block)
            digest.update(block)
            size += len(block)
        target.flush()
        os.fsync(target.fileno())
        after = os.fstat(source.fileno())
    if file_signature(before) != file_signature(after) or size != before.st_size:
        fail('A referenced photo changed during backup; the previous backup was preserved.')
    return {'bytes': size, 'sha256': digest.hexdigest()}


def create_backup(settings, schema):
    deadline = time.monotonic() + JOB_SECONDS
    postgres_version(deadline)
    created = now()
    identifier = utc_stamp(created) + '_' + secrets.token_hex(6)
    pending = Path(tempfile.mkdtemp(prefix='.pending-' + identifier + '-', dir=BACKUPS))
    pending.chmod(0o700)
    published = False
    try:
        photos_directory = pending / 'photos'
        photos_directory.mkdir(mode=0o700)
        copied = {}
        with DatabaseSnapshot(settings['database'], schema[1], deadline) as snapshot:
            with private_binary(pending / 'database.dump') as stream:
                pg_command('pg_dump', ['--format=custom', '--no-owner', '--no-acl',
                           '--snapshot=' + snapshot['snapshot_id']], database=settings['database'],
                           deadline=deadline, output=stream)
                stream.flush()
                os.fsync(stream.fileno())
            media_descriptor = photo_tools()['open_root'](MEDIA)
            try:
                for path in snapshot['photos']:
                    copied[path] = copy_photo(media_descriptor, path, photos_directory / path, deadline)
            finally:
                os.close(media_descriptor)
        manifest = {
            'format_version': 1, 'backup_id': identifier,
            'created_at_utc': timestamp(created), 'completed_at_utc': timestamp(),
            'postgres_major': POSTGRES_MAJOR, 'source_database': settings['database'],
            'schema_fingerprint': schema[0], 'schema_migrations': schema[1],
            'recipe_count': snapshot['recipe_count'], 'photo_count': len(copied),
            'dump': inspect_file(pending / 'database.dump', magic=True, deadline=deadline), 'photos': copied,
        }
        encoded_manifest = json_bytes(manifest)
        if len(encoded_manifest) > MAX_METADATA:
            fail('The backup manifest is too large; the previous backups were preserved.')
        with private_binary(pending / 'manifest.json') as stream:
            stream.write(encoded_manifest)
            stream.flush()
            os.fsync(stream.fileno())
        verify_files(pending, manifest, deadline=deadline)
        target = BACKUPS / identifier
        if target.exists() or target.is_symlink():
            fail('A backup identifier already exists; no completed backup was replaced.')
        pending.rename(target)
        published = True
        descriptor = ensure_storage()
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        # Only fully verified, known completed backups participate in retention.
        completed = complete_backups(verify=True, deadline=deadline)
        for unused_time, old_id, unused_manifest in completed[:-settings['keep']]:
            shutil.rmtree(BACKUPS / old_id)
        return identifier, manifest
    finally:
        if not published and pending.exists():
            shutil.rmtree(pending)


def verify_backup(identifier, schema, *, deadline=None):
    if not BACKUP_ID.fullmatch(identifier):
        fail('Use a dated backup identifier from the backup list.')
    directory = BACKUPS / identifier
    manifest = manifest_metadata(directory, expected_schema=schema)
    verify_files(directory, manifest, deadline=deadline)
    return directory, manifest


def install_photos(directory, manifest, deadline):
    media_descriptor = photo_tools()['open_root'](MEDIA)
    backup_descriptor = photo_tools()['open_root'](directory / 'photos')
    try:
        for path, metadata in manifest['photos'].items():
            remaining(deadline)
            parent, name = photo_tools()['parent_directory'](media_descriptor, path, create=True)
            temporary = '.backup-recovery-' + secrets.token_hex(12)
            try:
                matches = photo_tools()['existing_matches'](parent, name, metadata)
                if matches is True:
                    continue
                if matches is False:
                    fail('An existing photo has different contents; existing media was preserved.')
                descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                     0o600, dir_fd=parent)
                with os.fdopen(descriptor, 'wb') as target, photo_tools()['open_photo'](backup_descriptor, path) as source:
                    digest = hashlib.sha256()
                    size = 0
                    while True:
                        remaining(deadline)
                        block = source.read(1024 * 1024)
                        if not block:
                            break
                        target.write(block)
                        digest.update(block)
                        size += len(block)
                    target.flush()
                    os.fchmod(target.fileno(), 0o644)
                    os.fsync(target.fileno())
                if size != metadata['bytes'] or digest.hexdigest() != metadata['sha256']:
                    fail('A backup photo changed during recovery; existing media was preserved.')
                try:
                    os.link(temporary, name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
                except FileExistsError:
                    if not photo_tools()['existing_matches'](parent, name, metadata):
                        fail('An existing photo changed during recovery; it was not replaced.')
            finally:
                try:
                    os.unlink(temporary, dir_fd=parent)
                except FileNotFoundError:
                    pass
                os.close(parent)
    finally:
        os.close(backup_descriptor)
        os.close(media_descriptor)


def restore_backup(identifier, schema):
    deadline = time.monotonic() + JOB_SECONDS
    postgres_version(deadline)
    directory, manifest = verify_backup(identifier, schema, deadline=deadline)
    database = 'recipes_recovery_' + utc_stamp().lower() + '_' + secrets.token_hex(6)
    pg_command('createdb', ['--maintenance-db=postgres', '--template=template0', '--owner=recipes', '--', database],
               database='postgres', deadline=deadline)
    with (directory / 'database.dump').open('rb') as source:
        pg_command('pg_restore', ['--dbname=' + database, '--no-owner', '--no-acl', '--single-transaction', '--exit-on-error'],
                   database=database, deadline=deadline, input_stream=source, output=subprocess.DEVNULL)
    raw_count = psql('SELECT count(*) FROM public.recipes_recipe', database=database, deadline=deadline)
    try:
        count = int(raw_count.strip())
    except ValueError:
        fail('The recovered recipe count could not be read; no database was selected.')
    if count != manifest['recipe_count']:
        fail('The recovered recipe count does not match; no database was selected.')
    install_photos(directory, manifest, deadline)
    return database


class HealthReporter:
    def __init__(self, settings, schema):
        self.settings = settings
        self.schema = schema
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.failed = threading.Event()
        self.state = {'last_success_at': None, 'last_backup_id': None, 'last_error': None, 'running': False}
        self.thread = threading.Thread(target=self.loop, daemon=True)

    def update(self, *, latest=None, error=None, running=False):
        with self.lock:
            if latest is not None:
                if self.state['last_backup_id'] != latest['backup_id']:
                    self.state['last_error'] = None
                self.state['last_success_at'] = latest['completed_at_utc']
                self.state['last_backup_id'] = latest['backup_id']
            if error is not None:
                self.state['last_error'] = error
            self.state['running'] = running

    def publish(self):
        with self.lock:
            value = dict(self.state)
            value.update(format_version=1, database=self.settings['database'], schema_fingerprint=self.schema[0],
                         interval_seconds=self.settings['interval'], heartbeat_at=timestamp())
            # Serialize state capture and replacement so an older heartbeat
            # cannot overwrite a more recent success or failure from the job.
            atomic_health(value)

    def loop(self):
        while not self.stop.is_set():
            try:
                self.publish()
            except (BackupError, OSError, ValueError):
                self.failed.set()
                return
            self.stop.wait(HEARTBEAT_SECONDS)

    def close(self):
        self.stop.set()
        self.thread.join(timeout=5)


def daemon(settings, schema):
    reporter = HealthReporter(settings, schema)
    reporter.thread.start()
    retry_at = 0
    verified = None
    try:
        while True:
            if reporter.failed.is_set():
                fail('Backup health metadata could not be saved.')
            latest = None
            with storage_lock(exclusive=True):
                latest, verified = checked_latest(settings, schema, verified)
                due = latest is None or (now() - parse_time(latest['completed_at_utc'])).total_seconds() >= settings['interval']
                if due and time.monotonic() >= retry_at:
                    reporter.update(latest=latest, running=True)
                    try:
                        identifier, latest = create_backup(settings, schema)
                        reporter.update(latest=latest)
                        reporter.publish()
                        print('Backup completed: ' + identifier, flush=True)
                    except (BackupError, OSError, ValueError, TypeError) as error:
                        detail = str(error) if isinstance(error, BackupError) else 'A local backup file operation failed.'
                        reporter.update(latest=latest, error=detail + ' The previous completed backups remain.')
                        reporter.publish()
                        print(detail + ' Retrying in 60 seconds.', file=sys.stderr, flush=True)
                        retry_at = time.monotonic() + 60
                elif latest is not None:
                    reporter.update(latest=latest)
            time.sleep(HEARTBEAT_SECONDS)
    finally:
        reporter.close()


def health(settings, schema):
    value = read_json(BACKUPS / 'health.json')
    if (not isinstance(value, dict) or value.get('format_version') != 1
            or value.get('database') != settings['database'] or value.get('schema_fingerprint') != schema[0]
            or value.get('interval_seconds') != settings['interval'] or value.get('last_error') is not None
            or type(value.get('running')) is not bool
            or not isinstance(value.get('last_backup_id'), str)
            or not BACKUP_ID.fullmatch(value['last_backup_id'])):
        fail('The backup worker has no healthy completed backup for the selected database.')
    heartbeat_age = (now() - parse_time(value.get('heartbeat_at'))).total_seconds()
    success_age = (now() - parse_time(value.get('last_success_at'))).total_seconds()
    if not -60 <= heartbeat_age <= 120 or not -60 <= success_age <= settings['interval'] + HEALTH_GRACE_SECONDS:
        fail('The backup heartbeat or completed backup is stale.')
    manifest = manifest_metadata(BACKUPS / value['last_backup_id'], expected_schema=schema)
    if (manifest['source_database'] != settings['database']
            or manifest['completed_at_utc'] != value['last_success_at']):
        fail('The completed backup does not match the worker health metadata.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for command in ('daemon', 'once', 'list', 'health'):
        commands.add_parser(command)
    for command in ('verify', 'restore'):
        child = commands.add_parser(command)
        child.add_argument('backup_id')
    arguments = parser.parse_args()
    os.umask(0o077)
    try:
        settings = config()
        schema = local_schema()
        if arguments.command == 'health':
            health(settings, schema)
        elif arguments.command == 'daemon':
            daemon(settings, schema)
        elif arguments.command == 'once':
            with storage_lock(exclusive=True):
                identifier, unused_manifest = create_backup(settings, schema)
            print('Backup completed: ' + identifier)
        elif arguments.command == 'list':
            with storage_lock(exclusive=False):
                completed = complete_backups()
                for unused_time, identifier, manifest in reversed(completed):
                    print(identifier + ' | ' + manifest['completed_at_utc'] + ' | database=' + manifest['source_database']
                          + ' | recipes=' + str(manifest['recipe_count']) + ' | photos=' + str(manifest['photo_count']))
        elif arguments.command == 'verify':
            with storage_lock(exclusive=False):
                deadline = time.monotonic() + JOB_SECONDS
                verify_backup(arguments.backup_id, schema, deadline=deadline)
                postgres_version(deadline)
            print('Backup verified: ' + arguments.backup_id)
        else:
            with storage_lock(exclusive=False):
                database = restore_backup(arguments.backup_id, schema)
            print('Restored database: ' + database)
        return 0
    except (BackupError, OSError, ValueError, TypeError, KeyError, RecursionError) as error:
        detail = str(error) if isinstance(error, BackupError) else 'A local backup file operation failed.'
        print(detail + ' '
              'Completed backups and the website database selection were preserved.', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('Backup/recovery interrupted. Completed backups and the website database selection were preserved.', file=sys.stderr)
        return 130


if __name__ == '__main__':
    sys.exit(main())
