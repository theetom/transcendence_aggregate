"""Prepare local TLS safely after mkcert -install; stdout is changed/unchanged."""

import fcntl
import ipaddress
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile


RENEW_BEFORE_SECONDS = 30 * 24 * 60 * 60
PAIR_NAMES = ("server.crt", "server.key")
RELOAD_MARKER = ".frontend-reload-required"


class PreparationError(Exception):
    pass


def command(arguments):
    """Capture bounded public metadata/status only; never forward tool stderr."""
    with tempfile.TemporaryFile() as output:
        try:
            result = subprocess.run(
                arguments,
                stdin=subprocess.DEVNULL,
                stdout=output,
                stderr=subprocess.DEVNULL,
                timeout=60,
                check=False,
            )
        except subprocess.TimeoutExpired:
            raise PreparationError("A certificate command timed out; preparation stopped.")
        output.seek(0)
        public_output = output.read(65537)
        if len(public_output) > 65536:
            raise PreparationError("A certificate command returned too much metadata.")
        return result.returncode, public_output


def ensure_directory(directory):
    # Check every component before creating/following a configured directory.
    for path in list(reversed(directory.parents)) + [directory]:
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            path.mkdir(mode=0o700)
            metadata = path.lstat()
        if not stat.S_ISDIR(metadata.st_mode):
            raise PreparationError("TLS directory paths must be real directories, not symlinks.")


def regular_file(path):
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(metadata.st_mode):
        raise PreparationError("Certificate/key paths must be ordinary files, not symlinks.")
    return metadata


def readable_file(path):
    metadata = regular_file(path)
    return metadata is not None and metadata.st_size > 0 and os.access(path, os.R_OK)


def pair_snapshot(directory):
    snapshot = {}
    for name in PAIR_NAMES:
        metadata = regular_file(directory / name)
        snapshot[name] = None if metadata is None else (
            metadata.st_dev, metadata.st_ino, metadata.st_mode, metadata.st_size,
            metadata.st_mtime_ns, metadata.st_ctime_ns,
        )
    # Reading a certificate can update its access time; that is not a file edit.
    return snapshot


def valid_pair(directory, root_certificate, names):
    certificate = directory / PAIR_NAMES[0]
    private_key = directory / PAIR_NAMES[1]
    if not readable_file(certificate) or not readable_file(private_key):
        return False
    # Nginx has no password provider for an encrypted PEM key.
    with private_key.open("rb") as key_file:
        key_header = key_file.read(256)
    if b"ENCRYPTED" in key_header:
        return False

    code, _ = command([
        "openssl", "x509", "-in", str(certificate), "-noout",
        "-checkend", str(RENEW_BEFORE_SECONDS),
    ])
    if code != 0:
        return False
    code, alternative_names = command([
        "openssl", "x509", "-in", str(certificate), "-noout", "-ext", "subjectAltName",
    ])
    # DNS SANs are mandatory: do not permit a legacy common-name fallback.
    if code != 0 or not re.search(rb"(?:^|[\n,])\s*DNS:", alternative_names):
        return False

    code, certificate_public_key = command([
        "openssl", "x509", "-in", str(certificate), "-pubkey", "-noout",
    ])
    if code != 0 or not certificate_public_key:
        return False
    code, _ = command([
        "openssl", "pkey", "-in", str(private_key), "-passin", "pass:", "-check", "-noout",
    ])
    if code != 0:
        return False
    code, key_public_key = command([
        "openssl", "pkey", "-in", str(private_key), "-passin", "pass:", "-pubout",
    ])
    if code != 0 or certificate_public_key.strip() != key_public_key.strip():
        return False

    for name in names:
        try:
            address = ipaddress.ip_address(name)
        except ValueError:
            name_option = ["-verify_hostname", name]
        else:
            name_option = ["-verify_ip", str(address)]
        # -trusted disables default CA sources in OpenSSL 1.1.1 and 3.x.
        code, _ = command([
            "openssl", "verify", "-trusted", str(root_certificate),
            "-purpose", "sslserver",
        ] + name_option + [str(certificate)])
        if code != 0:
            return False
    return True


def install_pair(directory, staged_directory, original_snapshot):
    if pair_snapshot(directory) != original_snapshot:
        raise PreparationError("Certificate files changed during preparation; no replacement installed.")
    # Persist before replacing files: later build/trust failures must not lose
    # the need to load a new certificate into an existing Nginx process.
    descriptor = os.open(
        str(directory / RELOAD_MARKER), os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600,
    )
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise PreparationError("The frontend reload marker must be an ordinary file.")
    finally:
        os.close(descriptor)

    backup = None
    if any(metadata is not None for metadata in original_snapshot.values()):
        backup = Path(tempfile.mkdtemp(prefix=".previous-cert-", dir=str(directory)))
    saved = []
    installed = []
    try:
        for name in PAIR_NAMES:
            if original_snapshot[name] is not None:
                # Register before rename: interruption can arrive just after it.
                saved.append((name, original_snapshot[name][:2]))
                os.rename(directory / name, backup / name)
        for name in PAIR_NAMES:
            metadata = regular_file(staged_directory / name)
            installed.append((name, (metadata.st_dev, metadata.st_ino)))
            os.rename(staged_directory / name, directory / name)
    except (OSError, KeyboardInterrupt):
        restoration_failed = False
        for name, identity in reversed(installed):
            try:
                metadata = regular_file(directory / name)
                if metadata is None:
                    continue
                if (metadata.st_dev, metadata.st_ino) != identity:
                    restoration_failed = True
                    continue
                os.rename(directory / name, staged_directory / name)
            except (OSError, PreparationError):
                restoration_failed = True
        installed_identities = dict(installed)
        for name, identity in saved:
            try:
                metadata = regular_file(backup / name)
                current = regular_file(directory / name)
                current_identity = None if current is None else (current.st_dev, current.st_ino)
                if metadata is None:
                    # The original rename did not happen, or it was restored.
                    if current_identity != identity:
                        restoration_failed = True
                    continue
                if (metadata.st_dev, metadata.st_ino) != identity or (
                    current_identity is not None and current_identity != identity
                    and current_identity != installed_identities.get(name)
                ):
                    restoration_failed = True
                    continue
                os.replace(backup / name, directory / name)
            except (OSError, PreparationError):
                restoration_failed = True
        if restoration_failed:
            location = str(backup) if backup is not None else str(directory)
            raise PreparationError(
                "Certificate installation failed and restoration was incomplete. "
                "Keep the files in {} and inspect the TLS directory before retrying.".format(location)
            )
        raise PreparationError("Certificate installation failed; the original files were restored.")
    if backup is not None:
        print("Previous certificate files preserved in {}".format(backup), file=sys.stderr)


def prepare(directory, server_name):
    if not server_name or server_name.startswith("-") or any(
        character.isspace() for character in server_name
    ):
        raise PreparationError("SERVER_NAME must be one hostname or IP address.")
    for tool in ("mkcert", "openssl"):
        if shutil.which(tool) is None:
            raise PreparationError("{} is required for local certificate preparation.".format(tool))
    code, version_output = command(["openssl", "version"])
    version = re.match(rb"OpenSSL (\d+)\.(\d+)\.(\d+)", version_output)
    if code != 0 or version is None or tuple(map(int, version.groups())) < (1, 1, 1):
        raise PreparationError("OpenSSL 1.1.1 or newer is required; ask the administrator to update OpenSSL.")

    ensure_directory(directory)
    regular_file(directory / RELOAD_MARKER)
    # Serialize launches using the same directory; do not follow a lock symlink.
    descriptor = os.open(
        str(directory / ".prepare-local-cert.lock"),
        os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW,
        0o600,
    )
    with os.fdopen(descriptor, "w") as lock:
        if not stat.S_ISREG(os.fstat(lock.fileno()).st_mode):
            raise PreparationError("The certificate preparation lock must be an ordinary file.")
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise PreparationError("Another launch is preparing these certificates; retry after it finishes.")

        original_snapshot = pair_snapshot(directory)
        code, root_directory_output = command(["mkcert", "-CAROOT"])
        root_directory = root_directory_output.decode("utf-8").strip()
        if code != 0 or not root_directory or "\n" in root_directory or "\r" in root_directory:
            raise PreparationError("The current mkcert CA directory could not be determined.")
        root_certificate = Path(root_directory) / "rootCA.pem"
        if not readable_file(root_certificate):
            raise PreparationError("The current mkcert public CA is missing or unreadable; run mkcert -install first.")
        code, _ = command([
            "openssl", "verify", "-trusted", str(root_certificate),
            "-check_ss_sig", str(root_certificate),
        ])
        if code != 0:
            raise PreparationError("The current mkcert CA is invalid; it was not replaced.")
        code, _ = command([
            "openssl", "x509", "-in", str(root_certificate), "-noout",
            "-checkend", str(RENEW_BEFORE_SECONDS),
        ])
        if code != 0:
            raise PreparationError("The current mkcert CA expires within 30 days; no CA or certificate pair was replaced.")

        names = list(dict.fromkeys((server_name, "localhost", "127.0.0.1")))
        if valid_pair(directory, root_certificate, names):
            os.chmod(directory / PAIR_NAMES[0], 0o644)
            os.chmod(directory / PAIR_NAMES[1], 0o600)
            print("Reusing the verified local certificate pair.", file=sys.stderr)
            return "unchanged"

        # Require the established CA key so mkcert cannot create a replacement CA.
        if not readable_file(Path(root_directory) / "rootCA-key.pem"):
            raise PreparationError("The established mkcert signing key is unavailable; no CA or pair was replaced.")
        with tempfile.TemporaryDirectory(prefix=".prepare-cert-", dir=str(directory)) as staging:
            staged_directory = Path(staging)
            code, _ = command([
                "mkcert", "-cert-file", str(staged_directory / PAIR_NAMES[0]),
                "-key-file", str(staged_directory / PAIR_NAMES[1]),
            ] + names)
            if code != 0:
                raise PreparationError("Local certificate generation failed; the original pair was left in place.")
            if not valid_pair(staged_directory, root_certificate, names):
                raise PreparationError("The replacement certificate failed verification; the original pair was left in place.")
            os.chmod(staged_directory / PAIR_NAMES[0], 0o644)
            os.chmod(staged_directory / PAIR_NAMES[1], 0o600)
            install_pair(directory, staged_directory, original_snapshot)
        print("Installed a verified local certificate pair.", file=sys.stderr)
        return "changed"


def main():
    if len(sys.argv) != 3:
        raise PreparationError("Usage: python3 scripts/prepare-local-cert.py TLS_DIRECTORY SERVER_NAME")
    os.umask(0o077)
    directory = Path(os.path.abspath(sys.argv[1]))
    print(prepare(directory, sys.argv[2]))


if __name__ == "__main__":
    try:
        main()
    except (PreparationError, OSError, UnicodeError) as error:
        if isinstance(error, PreparationError):
            message = str(error)
        else:
            message = "Local certificate preparation failed; check tool access and directory permissions."
        print(message, file=sys.stderr)
        sys.exit(1)
