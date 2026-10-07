#!/bin/sh
# User-run transfer preparation. This never switches .env or deletes data.
set -eu
set -C
umask 077

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

project_directory=$(cd "$(dirname "$0")/.." && pwd)
cd "$project_directory"
command -v docker >/dev/null 2>&1 || fail 'Docker is required.'
command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required for backup and comparison.'
[ -s data/db.sqlite3 ] || fail 'The existing data/db.sqlite3 is missing or empty; no transfer attempted.'

# Resolve Compose settings without displaying secrets or sourcing .env as code.
compose_configuration=$(docker compose config --format json)
selected_engine=$(printf '%s' "$compose_configuration" | python3 -c '
import json, sys
print(json.load(sys.stdin)["services"]["backend"]["environment"]["DJANGO_DB_ENGINE"])
')
unset compose_configuration
[ "$selected_engine" = sqlite ] || fail 'Keep DJANGO_DB_ENGINE=sqlite until the transfer is compared.'
running_backend=$(docker compose ps --status running --quiet backend)
if [ -n "$running_backend" ]; then
    running_engine=$(docker compose exec -T backend python -c \
        "import os; print(os.environ.get('DJANGO_DB_ENGINE', 'sqlite').strip().lower())")
    [ "$running_engine" = sqlite ] || fail 'The running backend is not using SQLite; stop and review the data source.'
fi

maintenance_started=0
maintenance_complete=0
transfer_directory=
on_exit() {
    result=$?
    if [ "$result" -ne 0 ]; then
        printf '%s\n' 'Transfer did not finish. SQLite and .env were not replaced.' >&2
        if [ "$maintenance_complete" -eq 1 ]; then
            printf '%s\n' 'Frontend/backend remain stopped. Review the failure before restarting.' >&2
        elif [ "$maintenance_started" -eq 1 ]; then
            printf '%s\n' 'Stopping frontend/backend was attempted. Check docker compose ps before restarting.' >&2
        fi
        if [ -n "$transfer_directory" ]; then
            printf 'Private backup/export/log files: %s\n' "$transfer_directory" >&2
        fi
    fi
}
trap on_exit 0
trap 'exit 130' INT
trap 'exit 143' TERM

require_empty_postgres() {
    docker compose run --rm --no-deps -T -e DJANGO_DB_ENGINE=postgresql backend python - <<'PY'
import os
import sys
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()
from django.db import connection

allowed_tables = {"django_migrations", "auth_permission", "django_content_type"}
with connection.cursor() as cursor:
    for table in connection.introspection.table_names(cursor):
        if table in allowed_tables:
            continue
        cursor.execute("SELECT 1 FROM " + connection.ops.quote_name(table) + " LIMIT 1")
        if cursor.fetchone() is not None:
            sys.exit("PostgreSQL contains records in table " + table + "; transfer refused.")
print("PostgreSQL contains no application/account records; ready for import.")
PY
}

printf '%s\n' 'Building the backend driver and starting PostgreSQL; SQLite stays selected.'
docker compose build backend
docker compose up -d --wait --wait-timeout 120 postgres
require_empty_postgres
printf '%s\n' 'Preparing PostgreSQL tables with existing Django migrations.'
docker compose run --rm --no-deps -T -e DJANGO_DB_ENGINE=postgresql \
    backend python manage.py migrate --noinput
require_empty_postgres

printf '%s\n' 'Stopping frontend/backend to prevent website writes during backup and transfer.'
maintenance_started=1
docker compose stop frontend backend
maintenance_complete=1
[ ! -L data/postgres-transfer ] || fail 'The private transfer directory must not be a symbolic link.'
mkdir -p data/postgres-transfer
chmod 700 data/postgres-transfer
transfer_directory=$(mktemp -d data/postgres-transfer/transfer.XXXXXXXXXX)
container_directory="/data/postgres-transfer/$(basename "$transfer_directory")"

python3 - "$transfer_directory/sqlite-backup.sqlite3" <<'PY'
from pathlib import Path
import sqlite3
import sys

source = Path("data/db.sqlite3").resolve().as_uri() + "?mode=ro"
destination = Path(sys.argv[1])
if destination.exists():
    sys.exit("Backup output already exists; no overwrite attempted.")
with sqlite3.connect(source, uri=True) as original, sqlite3.connect(destination) as backup:
    original.backup(backup)
print("SQLite backup saved; the original database is unchanged.")
PY

printf '%s\n' 'Exporting the SQLite backup, retaining account/recipe IDs and timestamps.'
docker compose run --rm --no-deps -T -e DJANGO_DB_ENGINE=sqlite \
    backend python - "$container_directory/sqlite-backup.sqlite3" \
    < scripts/export-database.py > "$transfer_directory/source.json" \
    2> "$transfer_directory/sqlite-export.log"
python3 scripts/postgres-fixture.py prepare \
    "$transfer_directory/source.json" "$transfer_directory/prepared.json"

printf '%s\n' 'Importing into PostgreSQL. Import details are kept in the private transfer directory.'
docker compose run --rm --no-deps -T -e DJANGO_DB_ENGINE=postgresql \
    backend python manage.py loaddata "$container_directory/prepared.json" --verbosity 0 \
    > "$transfer_directory/import.log" 2>&1
docker compose run --rm --no-deps -T -e DJANGO_DB_ENGINE=postgresql \
    backend python - < scripts/export-database.py \
    > "$transfer_directory/target.json" 2> "$transfer_directory/postgres-export.log"
python3 scripts/postgres-fixture.py compare \
    "$transfer_directory/source.json" "$transfer_directory/target.json"

printf '\nPrivate backup and transfer files: %s\n' "$transfer_directory"
printf '%s\n' 'Transfer comparison passed. Frontend/backend remain stopped; .env still selects SQLite.'
printf '%s\n' 'To activate: set DJANGO_DB_ENGINE=postgresql in .env, then run:'
printf '%s\n' 'docker compose up -d --wait --wait-timeout 120 backend frontend'
printf '%s\n' 'Follow the step-five checks in docs/docker.md. Keep the original SQLite and private backup.'
