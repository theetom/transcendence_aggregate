#!/bin/sh
set -eu

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

project_directory=$(cd "$(dirname "$0")/.." && pwd -P)
cd "$project_directory"
[ "$(id -u)" -ne 0 ] || fail 'Run startup as your normal browser user.'
[ "$(uname -s)" = Linux ] || fail 'This no-sudo launcher targets Linux and WSL.'

command -v docker >/dev/null 2>&1 ||
    fail 'Docker and Compose must already be installed and accessible without sudo.'
docker compose version >/dev/null 2>&1 || fail 'A current Docker Compose plugin is required.'
docker info >/dev/null 2>&1 ||
    fail 'Docker is not accessible to your account. Start your permitted Docker service before retrying.'

# Browser bind mounts must refer to the computer running this shell.
if [ -n "${DOCKER_CONTEXT:-}" ]; then
    docker_endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}' "$DOCKER_CONTEXT")
elif [ -n "${DOCKER_HOST:-}" ]; then
    docker_endpoint=$DOCKER_HOST
else
    docker_endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}' "$(docker context show)")
fi
case "$docker_endpoint" in
    unix://*) ;;
    *) fail 'Local browser trust requires a local Docker socket; remote Docker endpoints are unsupported.' ;;
esac
security_options=$(docker info --format '{{json .SecurityOptions}}')
case "$security_options" in
    *rootless*) tools_user=0:0 ;; # Rootless UID0 maps to the daemon user's host account.
    *userns*) fail 'Remapped rootful Docker cannot safely write your browser stores. Use your permitted local/rootless Docker setup.' ;;
    *) tools_user="$(id -u):$(id -g)" ;;
esac

# Compose alone resolves private .env values. Never print or execute that file.
if ! compose_configuration=$(docker compose config --format json); then
    fail 'Compose configuration is incomplete. Supply the matching private credentials; existing secrets and storage were not replaced.'
fi
browser_home=$(cd "$HOME" && pwd -P)
if [ -n "${XDG_DATA_HOME:-}" ]; then
    case "$XDG_DATA_HOME" in
        /*) ;;
        *) fail 'XDG_DATA_HOME must be an absolute directory path.' ;;
    esac
    chrome_current_candidate="$XDG_DATA_HOME/pki/nssdb"
else
    chrome_current_candidate="$browser_home/.local/share/pki/nssdb"
fi
if [ -n "${CAROOT:-}" ]; then
    ca_candidate=$CAROOT
elif [ -n "${XDG_DATA_HOME:-}" ]; then
    ca_candidate="$XDG_DATA_HOME/mkcert"
else
    ca_candidate="$browser_home/.local/share/mkcert"
fi

tools_image=transcendence-local-cert-tools:mkcert-1.4.4
printf '%s\n' 'Preparing cached certificate tools inside Docker; no host packages or sudo are used.'
docker build --tag "$tools_image" --file scripts/cert-tools.Dockerfile scripts

tool_container() {
    docker run --rm --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges --user "$tools_user" \
        --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
        --env "HOME=$browser_home" --env "CAROOT=$ca_directory" \
        --env TRUST_STORES=nss "$@"
}

# The parser does not need filesystem mounts or host Python.
startup_settings=$(printf '%s' "$compose_configuration" |
    docker run --rm --interactive --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges --user "$tools_user" "$tools_image" python3 -c '
import json
import os
import sys

frontend = json.load(sys.stdin)["services"]["frontend"]
mounts = [mount for mount in frontend.get("volumes", [])
          if mount.get("target") == "/etc/nginx/certs" and mount.get("type") == "bind"]
if len(mounts) != 1:
    sys.exit("Expected exactly one frontend certificate bind mount.")
def absolute(value):
    normalized = os.path.normpath(value if os.path.isabs(value) else os.path.join(sys.argv[2], value))
    return "/" + normalized.lstrip("/")
tls = absolute(mounts[0]["source"])
ca = absolute(sys.argv[1])
chrome_current = absolute(sys.argv[4])
chrome_legacy = os.path.join(sys.argv[3], ".pki/nssdb")
values = [tls, frontend["environment"]["SERVER_NAME"],
          str(frontend["environment"]["HTTPS_PORT"]), ca, chrome_current]
if any(not value or "\n" in value or "\r" in value for value in values):
    sys.exit("Certificate path, server name and HTTPS port must be nonempty single-line values.")
if values[1].startswith("-") or any(character.isspace() for character in values[1]):
    sys.exit("SERVER_NAME must be one hostname or IP address.")
for path in (tls, ca, sys.argv[3], chrome_current):
    if "," in path or "\"" in path:
        sys.exit("Docker certificate/browser bind paths cannot contain commas or double quotes.")
if tls in ("/", sys.argv[2], sys.argv[3]) or ca in ("/", sys.argv[2], sys.argv[3]):
    sys.exit("Use dedicated certificate and CA directories, not your home or repository root.")
if os.path.commonpath((tls, ca)) == tls:
    sys.exit("The private CA must remain outside the certificate directory mounted into Nginx.")
for chrome in (chrome_legacy, chrome_current):
    for certificate_path in (tls, ca):
        if os.path.commonpath((chrome, certificate_path)) in (chrome, certificate_path):
            sys.exit("Certificate and CA directories must be separate from Chrome certificate stores.")
for value in values:
    print(value)
' "$ca_candidate" "$project_directory" "$browser_home" "$chrome_current_candidate")
unset compose_configuration
{
    IFS= read -r tls_directory
    IFS= read -r server_name
    IFS= read -r https_port
    IFS= read -r ca_directory
    IFS= read -r chrome_current
} <<EOF
$startup_settings
EOF

ensure_user_directory() {
    # Create bind sources as the normal host user, checking every component.
    remainder=${1#/}
    checked_path=
    while [ -n "$remainder" ]; do
        component=${remainder%%/*}
        case "$remainder" in
            */*) remainder=${remainder#*/} ;;
            *) remainder= ;;
        esac
        case "$component" in
            ''|.) continue ;;
            ..) fail 'Bind directory paths must not contain parent-directory components.' ;;
        esac
        checked_path="$checked_path/$component"
        [ ! -L "$checked_path" ] || fail 'Certificate/browser bind directories must not be symlinks.'
        if [ -e "$checked_path" ]; then
            [ -d "$checked_path" ] || fail 'A certificate/browser directory path is occupied by a file.'
        else
            mkdir -m 700 "$checked_path"
        fi
    done
}

ensure_user_directory "$ca_directory"
ensure_user_directory "$tls_directory"

printf '%s\n' 'Preparing this user’s local CA without installing system trust.'
tool_container --mount "type=bind,source=$ca_directory,target=$ca_directory" \
    "$tools_image" python3 /opt/local-tools/bootstrap-local-ca.py "$ca_directory"

printf '%s\n' 'Checking the local certificate CA, names, key and expiry.'
certificate_state=$(tool_container \
    --mount "type=bind,source=$ca_directory,target=$ca_directory,readonly" \
    --mount "type=bind,source=$tls_directory,target=$tls_directory" \
    "$tools_image" python3 /opt/local-tools/prepare-local-cert.py "$tls_directory" "$server_name")
case "$certificate_state" in
    unchanged|changed) ;;
    *) fail 'Local certificate preparation returned an unexpected result.' ;;
esac

wsl_detected=0
case "$(uname -r)" in
    *[Mm]icrosoft*|*WSL*) wsl_detected=1 ;;
esac
if [ -n "${WSL_INTEROP:-}" ] || [ -n "${WSL_DISTRO_NAME:-}" ]; then
    wsl_detected=1
fi
if [ "$wsl_detected" -eq 1 ]; then
    command -v certutil.exe >/dev/null 2>&1 &&
        command -v wslpath >/dev/null 2>&1 ||
        fail 'WSL startup targets Windows Chrome and requires certutil.exe and wslpath. Enable permitted Windows interoperability, or import rootCA.pem into Windows user trust manually.'
    printf '%s\n' 'Importing the public CA into Windows user trust. Confirm the Windows prompt if shown.'
    certutil.exe -user -addstore Root "$(wslpath -w "$ca_directory/rootCA.pem")" ||
        fail 'Windows user CA import failed; your browser still needs this public CA trusted.'
else
    chrome_legacy="$browser_home/.pki/nssdb"
    # Chrome selects an existing legacy directory before its newer XDG store.
    # Do not create an unused legacy directory that would change that selection.
    if [ -e "$chrome_legacy" ] || [ -L "$chrome_legacy" ]; then
        chrome_store=$chrome_legacy
    elif [ -e "$chrome_current" ] || [ -L "$chrome_current" ]; then
        chrome_store=$chrome_current
    else
        chrome_store=$chrome_legacy
    fi
    ensure_user_directory "$chrome_store"
    printf '%s\n' 'Importing and verifying the public CA in your Linux Chrome user store; close Chrome before startup.'
    tool_container --env LOCAL_CHROMIUM_AVAILABLE=1 --env "LOCAL_CHROME_NSS_DIR=$chrome_store" \
        --mount "type=bind,source=$ca_directory/rootCA.pem,target=/opt/public-rootCA.pem,readonly" \
        --mount "type=bind,source=$chrome_store,target=$chrome_store" \
        "$tools_image" python3 /opt/local-tools/install-browser-trust.py /opt/public-rootCA.pem required chrome
fi

recreate_frontend=0
reload_marker="$tls_directory/.frontend-reload-required"
if [ -e "$reload_marker" ]; then
    frontend_container=$(docker compose ps --all --quiet frontend)
    [ -z "$frontend_container" ] || recreate_frontend=1
fi
printf '%s\n' 'Building and starting Compose services; existing backend migrations may be applied.'
docker compose up -d --build --wait --wait-timeout 120
if [ "$recreate_frontend" -eq 1 ]; then
    printf '%s\n' 'Recreating frontend to load the updated local certificate.'
    docker compose up -d --no-deps --force-recreate --wait --wait-timeout 120 frontend
fi
if [ -e "$reload_marker" ]; then
    rm -f "$reload_marker"
fi

printf '\nOpen https://%s:%s\n' "$server_name" "$https_port"
printf '%s\n' 'Fully restart Chrome after trust setup, including incognito windows.'
printf '%s\n' 'Browser trust must be checked in the actual evaluation browser; this setup does not change system-client trust.'
