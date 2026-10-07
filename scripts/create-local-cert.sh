#!/bin/sh
set -eu

if ! command -v mkcert >/dev/null 2>&1; then
    printf '%s\n' 'mkcert is required. See docs/docker.md for installation and trust setup.' >&2
    exit 1
fi

project_directory=$(cd "$(dirname "$0")/.." && pwd)
tls_directory=${1:-"$project_directory/certs"}
if [ "$#" -gt 0 ]; then
    shift
fi

case "$tls_directory" in
    /*) ;;
    *) tls_directory="$project_directory/$tls_directory" ;;
esac

if [ "$#" -eq 0 ]; then
    set -- localhost 127.0.0.1
fi

for hostname in "$@"; do
    case "$hostname" in
        ''|-*)
            printf '%s\n' 'Supply DNS names or IP addresses, not mkcert options.' >&2
            exit 1
            ;;
    esac
done

certificate_file="$tls_directory/server.crt"
private_key_file="$tls_directory/server.key"
if [ -e "$certificate_file" ] || [ -L "$certificate_file" ] ||
   [ -e "$private_key_file" ] || [ -L "$private_key_file" ]; then
    printf '%s\n' 'Certificate output already exists; no files were overwritten.' >&2
    printf '%s\n' 'Use the existing pair, or choose a new TLS_CERT_DIR for renewal.' >&2
    exit 1
fi

umask 077
mkdir -p "$tls_directory"
mkcert -cert-file "$certificate_file" -key-file "$private_key_file" "$@"
chmod 600 "$private_key_file"
chmod 644 "$certificate_file"

printf 'Certificate files created in %s\n' "$tls_directory"
printf '%s\n' 'Use this directory for TLS_CERT_DIR. Run mkcert -install to trust the local CA if needed.'
