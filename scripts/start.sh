#!/bin/sh
set -eu

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

project_directory=$(cd "$(dirname "$0")/.." && pwd)
cd "$project_directory"

if [ "$(id -u)" -eq 0 ]; then
    fail 'Run this script as your normal browser user, not with sudo. Only dependency installation requests sudo.'
fi

command -v docker >/dev/null 2>&1 ||
    fail 'Install Docker Engine/Desktop and Docker Compose first. See docs/docker.md.'
docker compose version >/dev/null 2>&1 ||
    fail 'Docker Compose is required. Install a current Docker Compose plugin first.'
docker info >/dev/null 2>&1 ||
    fail 'Docker is not accessible. Start Docker and ensure your normal user can use it, then retry.'

# Only missing host tools are installed. Node/Python app dependencies stay in images.
set --
command -v mkcert >/dev/null 2>&1 || set -- "$@" mkcert
command -v python3 >/dev/null 2>&1 || set -- "$@" python3
if [ "$(uname -s)" = Linux ]; then
    command -v certutil >/dev/null 2>&1 || set -- "$@" libnss3-tools
fi

if [ "$#" -gt 0 ]; then
    command -v apt-get >/dev/null 2>&1 ||
        fail 'Automatic host-tool installation supports Debian/Kali/Ubuntu. Install mkcert, Python 3, and (on Linux) certutil for your platform, then retry.'
    command -v sudo >/dev/null 2>&1 ||
        fail 'Missing host tools need administrator installation, but sudo is unavailable. Ask the machine administrator to install the prerequisites.'
    printf 'Installing missing host tools through apt: %s\n' "$*"
    printf '%s\n' 'This requires network access and may ask for your administrator password.'
    sudo apt-get update
    sudo apt-get install -y "$@"
fi

# Let Compose resolve .env, exported variables and relative bind paths. Never source
# .env or print the resolved configuration, which may contain future credentials.
compose_configuration=$(docker compose config --format json)
startup_settings=$(printf '%s' "$compose_configuration" | python3 -c '
import json
import sys

frontend = json.load(sys.stdin)["services"]["frontend"]
mounts = [mount for mount in frontend.get("volumes", [])
          if mount.get("target") == "/etc/nginx/certs" and mount.get("type") == "bind"]
if len(mounts) != 1:
    sys.exit("Expected exactly one frontend certificate bind mount.")
values = [mounts[0]["source"], frontend["environment"]["SERVER_NAME"],
          str(frontend["environment"]["HTTPS_PORT"])]
if any(not value or "\n" in value or "\r" in value for value in values):
    sys.exit("Certificate path, server name and HTTPS port must be nonempty single-line values.")
if values[1].startswith("-") or any(character.isspace() for character in values[1]):
    sys.exit("SERVER_NAME must be a single hostname or IP address, not options or multiple names.")
for value in values:
    print(value)
')
unset compose_configuration
{
    IFS= read -r tls_directory
    IFS= read -r server_name
    IFS= read -r https_port
} <<EOF
$startup_settings
EOF

certificate_file="$tls_directory/server.crt"
private_key_file="$tls_directory/server.key"
if [ -e "$certificate_file" ] || [ -L "$certificate_file" ] ||
   [ -e "$private_key_file" ] || [ -L "$private_key_file" ]; then
    if [ ! -s "$certificate_file" ] || [ ! -r "$certificate_file" ] ||
       [ ! -s "$private_key_file" ] || [ ! -r "$private_key_file" ]; then
        fail 'An incomplete, empty or unreadable certificate pair exists. No files were overwritten. Choose a new TLS_CERT_DIR or restore the pair.'
    fi
    printf 'Reusing certificate files in %s (no overwrite).\n' "$tls_directory"
else
    sh scripts/create-local-cert.sh "$tls_directory" "$server_name" localhost 127.0.0.1
fi

printf '%s\n' 'Installing/checking this user’s local CA trust. Administrator authentication may be requested.'
mkcert -install
printf '%s\n' 'Building and starting all Compose services; existing backend migrations may be applied.'
docker compose up -d --build --wait --wait-timeout 120

printf '\nOpen https://%s:%s\n' "$server_name" "$https_port"
printf '%s\n' 'Restart your browser after first-time trust setup. Certificate warnings are not a successful trust check.'
printf '%s\n' 'If an existing certificate is expired, has different names, or belongs to a different CA, see the safe renewal instructions in docs/docker.md.'
