#!/bin/sh
# Shared setup for the normal launcher and explicit backup/recovery commands.
# Compose reads .env itself; this helper never sources or prints private values.

prepare_backup_environment() {
    backup_project_directory=$1
    backup_supplied_user=${2:-}

    if [ "$(id -u)" -eq 0 ]; then
        printf '%s\n' 'Run backup setup as your normal user, not sudo.' >&2
        return 1
    fi
    case "$(uname -s)" in
        Linux) ;;
        *) printf '%s\n' 'Backup setup supports Linux and WSL.' >&2; return 1 ;;
    esac

    if [ -n "$backup_supplied_user" ]; then
        # The launcher has already checked its local Docker/user mapping.
        BACKUP_USER=$backup_supplied_user
    else
        if [ -n "${DOCKER_CONTEXT:-}" ]; then
            backup_docker_endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}' "$DOCKER_CONTEXT") || return 1
        elif [ -n "${DOCKER_HOST:-}" ]; then
            backup_docker_endpoint=$DOCKER_HOST
        else
            backup_docker_endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}' "$(docker context show)") || return 1
        fi
        case "$backup_docker_endpoint" in
            unix://*) ;;
            *) printf '%s\n' 'Local backup storage requires a local Unix Docker socket.' >&2; return 1 ;;
        esac
        backup_security_options=$(docker info --format '{{json .SecurityOptions}}') || return 1
        case "$backup_security_options" in
            *rootless*) BACKUP_USER=0:0 ;;
            *userns*)
                printf '%s\n' 'Remapped rootful Docker is unsupported for private backup bind mounts.' >&2
                return 1
                ;;
            *) BACKUP_USER="$(id -u):$(id -g)" ;;
        esac
    fi

    python3 - "$backup_project_directory" "$BACKUP_USER" <<'PY'
import os
from pathlib import Path
import re
import stat
import sys

project = Path(sys.argv[1])
if not project.is_absolute() or not project.is_dir() or project.is_symlink():
    raise SystemExit('The project directory must be a regular absolute directory.')
if not re.fullmatch(r'[0-9]+:[0-9]+', sys.argv[2]):
    raise SystemExit('The backup container user mapping is invalid.')

try:
    current = project
    for name in ('data', 'backups'):
        current = current / name
        if current.is_symlink():
            raise SystemExit('Backup directories must not be symbolic links.')
        try:
            details = current.stat()
        except FileNotFoundError:
            current.mkdir(mode=0o700)
            details = current.stat()
        if not stat.S_ISDIR(details.st_mode):
            raise SystemExit('A backup directory path is not a directory.')
        if name == 'backups':
            if details.st_uid != os.getuid():
                raise SystemExit('The private backup directory must belong to your normal user.')
            current.chmod(0o700)
except OSError:
    raise SystemExit('Could not prepare private backup storage; existing files were preserved.')
PY
    backup_setup_result=$?
    [ "$backup_setup_result" -eq 0 ] || return "$backup_setup_result"
    export BACKUP_USER
}
