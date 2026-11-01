#!/bin/sh
set -eu

backup_fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

backup_usage() {
    printf '%s\n' \
        'Usage: sh scripts/backups.sh COMMAND [ARGUMENT]' \
        '  start                 Build/start website and scheduled backups; PostgreSQL must already be running.' \
        '  now                   Make one dated database/photo backup.' \
        '  list                  List completed backups.' \
        '  verify BACKUP_ID      Check a completed backup without restoring it.' \
        '  restore BACKUP_ID     Restore into a new database; keep the website selection unchanged.' \
        '  activate DATABASE     Select a successfully restored database and recreate backend/backups.'
}

case "${1:-}" in
    -h|--help)
        [ "$#" -eq 1 ] || backup_fail 'Help does not accept additional arguments.'
        backup_usage
        exit 0
        ;;
    start|now|list)
        [ "$#" -eq 1 ] || backup_fail 'This command does not accept an argument.'
        ;;
    verify|restore|activate)
        [ "$#" -eq 2 ] && [ -n "$2" ] || backup_fail 'Supply exactly one backup ID or restored database name.'
        ;;
    *) backup_usage >&2; exit 1 ;;
esac

backup_command=$1
backup_argument=${2:-}
project_directory=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$project_directory"

[ "$(id -u)" -ne 0 ] || backup_fail 'Run backup commands as your normal user, not sudo.'
[ "$(uname -s)" = Linux ] || backup_fail 'Backup commands support Linux and WSL.'
command -v python3 >/dev/null 2>&1 || backup_fail 'Python 3 is required for backup commands.'
command -v docker >/dev/null 2>&1 || backup_fail 'Docker and Compose must already be installed.'
docker compose version >/dev/null 2>&1 || backup_fail 'A current Docker Compose plugin is required.'
docker info >/dev/null 2>&1 || backup_fail 'Start your permitted local Docker service before continuing.'

. "$project_directory/scripts/backup-env.sh"
prepare_backup_environment "$project_directory"

# This Python code runs only when the user invokes restore/activate. Receipts
# contain no credentials and permit activation only after a successful restore.
recovery_metadata() {
    python3 -c '
import datetime
import json
import os
from pathlib import Path
import re
import runpy
import stat
import sys
import tempfile

project = Path(sys.argv[1])
mode = sys.argv[2]
argument = sys.argv[3]
database_pattern = r"recipes_recovery_[0-9]{8}t[0-9]{6}z_[0-9a-f]{12}"
backup_pattern = r"[0-9]{8}T[0-9]{6}Z_[0-9a-f]{12}"

def fail(message):
    raise SystemExit(message)

def private_directory():
    current = project
    for part in ("data", "database-private", "backup-recovery"):
        current = current / part
        if current.is_symlink():
            fail("Recovery receipt directories must not be symbolic links.")
        try:
            details = current.stat()
        except FileNotFoundError:
            current.mkdir(mode=0o700)
            details = current.stat()
        if not stat.S_ISDIR(details.st_mode):
            fail("A recovery receipt directory path is not a directory.")
        if part != "data":
            if details.st_uid != os.getuid():
                fail("Recovery receipts must belong to your normal user.")
            current.chmod(0o700)
    return current

def read_receipt(database):
    if re.fullmatch(database_pattern, database) is None:
        fail("Choose the database name printed by a successful backup restore.")
    path = private_directory() / (database + ".json")
    if path.is_symlink() or not path.is_file():
        fail("No completed local recovery receipt exists for this database.")
    details = path.stat()
    if (details.st_uid != os.getuid() or details.st_nlink != 1
            or details.st_mode & 0o077 or details.st_size > 8192):
        fail("The local recovery receipt has unsafe ownership, permissions or size.")
    receipt = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(receipt, dict)
            or set(receipt) != {"format_version", "status", "backup_id", "database", "restored_at_utc"}
            or type(receipt["format_version"]) is not int or receipt["format_version"] != 1
            or receipt["status"] != "restore-complete" or receipt["database"] != database
            or not isinstance(receipt["backup_id"], str)
            or re.fullmatch(backup_pattern, receipt["backup_id"]) is None):
        fail("The local recovery receipt is invalid.")
    stamp = datetime.datetime.fromisoformat(receipt["restored_at_utc"])
    if stamp.utcoffset() != datetime.timedelta(0):
        fail("The local recovery receipt timestamp is invalid.")
    return receipt

try:
    if mode == "record":
        if re.fullmatch(backup_pattern, argument) is None:
            fail("The completed restore backup identifier is invalid.")
        output = sys.stdin.read(65537)
        if len(output) > 65536:
            fail("The restore result was unexpectedly large; activation was not recorded.")
        names = re.findall(r"^Restored database: (" + database_pattern + r")$", output, re.MULTILINE)
        if len(names) != 1:
            fail("The successful restore did not report one expected database name; activation was not recorded.")
        database = names[0]
        directory = private_directory()
        destination = directory / (database + ".json")
        receipt = {
            "format_version": 1,
            "status": "restore-complete",
            "backup_id": argument,
            "database": database,
            "restored_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        descriptor, temporary_name = tempfile.mkstemp(prefix=".recovery-", dir=directory)
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write((json.dumps(receipt, sort_keys=True) + "\n").encode("utf-8"))
                stream.flush()
                os.fsync(stream.fileno())
            os.link(temporary, destination)
        finally:
            temporary.unlink()
        print(database)
    elif mode == "verify":
        read_receipt(argument)
        print(argument)
    elif mode == "select":
        read_receipt(argument)
        helper = project / "scripts/share-postgres.py"
        if helper.is_symlink() or not helper.is_file():
            fail("The existing safe database-selection helper is unavailable.")
        tools = runpy.run_path(str(helper))
        try:
            tools["environment_selection"](argument, write=True)
        except tools["Failure"] as failure:
            fail(str(failure))
    else:
        fail("Unknown recovery metadata operation.")
except (OSError, ValueError, TypeError, KeyError, UnicodeError):
    fail("Could not safely read or save recovery metadata; review the local files before retrying.")
' "$project_directory" "$@"
}

case "$backup_command" in
    start)
        printf '%s\n' 'Building and starting the website and scheduled backup worker.'
        docker compose up -d --no-deps --build --wait --wait-timeout 360 backend frontend backups
        ;;
    now)
        docker compose run --rm --no-deps -T backups once
        ;;
    list)
        docker compose run --rm --no-deps -T backups list
        ;;
    verify)
        docker compose run --build --rm --no-deps -T backups verify "$backup_argument"
        ;;
    restore)
        printf '%s\n' 'Restoring into a separate database; the current website database will remain selected.'
        if ! backup_restore_output=$(docker compose --profile recovery run --build --rm --no-deps -T backup-restore restore "$backup_argument"); then
            backup_fail 'Restore failed. The current database selection was not changed; review the worker error.'
        fi
        printf '%s\n' "$backup_restore_output"
        backup_restored_database=$(printf '%s\n' "$backup_restore_output" | recovery_metadata record "$backup_argument") ||
            backup_fail 'Restore completed, but its activation receipt could not be saved. No database selection was changed.'
        printf 'To activate this restored database: sh scripts/backups.sh activate %s\n' "$backup_restored_database"
        ;;
    activate)
        backup_database=$(recovery_metadata verify "$backup_argument" </dev/null) ||
            backup_fail 'Activation requires a valid completed local recovery receipt.'
        backup_database_exists=$(docker compose exec -T postgres psql --no-password -X -q -t -A \
            -v ON_ERROR_STOP=1 -U recipes -d postgres -c \
            "SELECT 1 FROM pg_database WHERE datname = '$backup_database'") ||
            backup_fail 'Could not verify the restored database. Database selection was not changed.'
        [ "$backup_database_exists" = 1 ] || backup_fail 'The restored database is missing. Database selection was not changed.'
        recovery_metadata select "$backup_database" </dev/null
        printf 'Selected %s in .env; recreating backend and scheduled backups.\n' "$backup_database"
        if ! docker compose up -d --no-deps --build --force-recreate --wait --wait-timeout 360 backend backups; then
            backup_fail 'The .env selection was written, but services did not become healthy. Both databases were preserved; review service errors before retrying activation.'
        fi
        printf '%s\n' 'Recovery activated. The previous database was preserved.' \
            'Run sh scripts/export.sh to refresh shared data before the next normal startup or Git delivery.'
        ;;
esac
