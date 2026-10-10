"""Preserve or bootstrap a local CA without installing any trust on the host."""

import fcntl
from importlib.util import module_from_spec, spec_from_file_location
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile


sys.dont_write_bytecode = True
specification = spec_from_file_location(
    "local_certificate_preparation", Path(__file__).with_name("prepare-local-cert.py")
)
preparation = module_from_spec(specification)
specification.loader.exec_module(preparation)
PreparationError = preparation.PreparationError
command = preparation.command
CA_NAMES = ("rootCA-key.pem", "rootCA.pem")


class IncompleteInstallationError(PreparationError):
    """Leave protected staging available when rollback could not finish."""


def validate_ca(directory):
    certificate = directory / "rootCA.pem"
    private_key = directory / "rootCA-key.pem"
    if not preparation.readable_file(certificate) or not preparation.readable_file(private_key):
        raise PreparationError("The local CA is incomplete or unreadable; restore its original files.")
    with private_key.open("rb") as key_file:
        if b"ENCRYPTED" in key_file.read(256):
            raise PreparationError("The local CA signing key is encrypted; it was not changed.")
    code, names = command([
        "openssl", "x509", "-in", str(certificate), "-noout",
        "-subject", "-issuer", "-nameopt", "RFC2253",
    ])
    names = names.splitlines()
    if code != 0 or len(names) != 2 or not names[0].startswith(b"subject=") or (
        not names[1].startswith(b"issuer=")
    ) or names[0].partition(b"=")[2] != names[1].partition(b"=")[2]:
        raise PreparationError("The local CA certificate is not self-issued; it was not changed.")
    code, _ = command([
        "openssl", "verify", "-trusted", str(certificate),
        "-check_ss_sig", str(certificate),
    ])
    if code != 0:
        raise PreparationError("The local CA certificate is invalid; it was not changed.")
    code, constraints = command([
        "openssl", "x509", "-in", str(certificate), "-noout", "-ext", "basicConstraints",
    ])
    if code != 0 or not re.search(rb"\bCA:TRUE\b", constraints):
        raise PreparationError("The local certificate is not a CA; it was not changed.")
    code, _ = command([
        "openssl", "x509", "-in", str(certificate), "-noout",
        "-checkend", str(preparation.RENEW_BEFORE_SECONDS),
    ])
    if code != 0:
        raise PreparationError("The local CA expires within 30 days; restore or review it without replacing its identity.")
    code, _ = command([
        "openssl", "pkey", "-in", str(private_key), "-passin", "pass:", "-check", "-noout",
    ])
    if code != 0:
        raise PreparationError("The local CA signing key is invalid; it was not changed.")
    code, certificate_key = command([
        "openssl", "x509", "-in", str(certificate), "-pubkey", "-noout",
    ])
    if code != 0 or not certificate_key:
        raise PreparationError("The public local CA key could not be read.")
    code, signing_key = command([
        "openssl", "pkey", "-in", str(private_key), "-passin", "pass:", "-pubout",
    ])
    if code != 0 or signing_key.strip() != certificate_key.strip():
        raise PreparationError("The local CA certificate and signing key do not match; neither was changed.")


def generate_ca(staging):
    # An empty isolated HOME hides every host browser store from mkcert.
    isolated_home = staging / "home"
    isolated_home.mkdir(mode=0o700)
    environment = os.environ.copy()
    environment.update({
        "CAROOT": str(staging), "HOME": str(isolated_home),
        "XDG_DATA_HOME": str(isolated_home), "TRUST_STORES": "nss",
    })
    try:
        result = subprocess.run(
            ["mkcert", "-install"], env=environment,
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, timeout=60, check=False,
        )
    except subprocess.TimeoutExpired:
        raise PreparationError("Local CA generation timed out; no CA was installed.")
    if result.returncode != 0:
        raise PreparationError("Local CA generation failed; no CA was installed.")
    validate_ca(staging)


def install_ca(directory, staging):
    candidates = []
    try:
        for name in CA_NAMES:
            source = staging / name
            destination = directory / name
            metadata = preparation.regular_file(source)
            # Record before linking so interruption cannot leave an untracked
            # file. Rollback only removes this staging inode, never another file.
            candidates.append((destination, metadata.st_dev, metadata.st_ino))
            # A hard link creates the destination atomically and refuses overwrite.
            os.link(source, destination)
    except (OSError, KeyboardInterrupt):
        rollback_failed = False
        for destination, device, inode in reversed(candidates):
            try:
                metadata = destination.lstat()
                if stat.S_ISREG(metadata.st_mode) and (
                    metadata.st_dev, metadata.st_ino
                ) == (device, inode):
                    destination.unlink()
            except FileNotFoundError:
                pass
            except OSError:
                rollback_failed = True
        if rollback_failed:
            raise IncompleteInstallationError(
                "New CA installation failed and cleanup was incomplete. "
                "Keep the protected files in {} and review the CA directory before retrying.".format(staging)
            )
        raise PreparationError("New CA installation failed; only this attempt's own new files were removed.")


def bootstrap(directory):
    preparation.ensure_directory(directory)
    lock_path = directory / ".bootstrap-local-ca.lock"
    preparation.regular_file(lock_path)
    descriptor = os.open(
        str(lock_path), os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600,
    )
    with os.fdopen(descriptor, "w") as lock:
        if not stat.S_ISREG(os.fstat(lock.fileno()).st_mode):
            raise PreparationError("The CA bootstrap lock must be an ordinary file.")
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise PreparationError("Another launch is preparing this CA; retry after it finishes.")

        certificate = preparation.regular_file(directory / "rootCA.pem")
        private_key = preparation.regular_file(directory / "rootCA-key.pem")
        if private_key is not None and certificate is None:
            raise PreparationError("An existing CA signing key has no public certificate; restore rootCA.pem. The key was preserved.")
        if certificate is not None or private_key is not None:
            validate_ca(directory)
            return "unchanged"

        staging = Path(tempfile.mkdtemp(prefix=".new-ca-", dir=str(directory)))
        preserve_staging = False
        try:
            generate_ca(staging)
            os.chmod(staging / "rootCA-key.pem", 0o400)
            os.chmod(staging / "rootCA.pem", 0o644)
            install_ca(directory, staging)
        except IncompleteInstallationError:
            preserve_staging = True
            raise
        finally:
            if not preserve_staging:
                shutil.rmtree(staging)
        return "created"


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise PreparationError("Usage: python3 bootstrap-local-ca.py CA_DIRECTORY")
        os.umask(0o077)
        for tool in ("mkcert", "openssl"):
            if shutil.which(tool) is None:
                raise PreparationError("{} is required inside the certificate tooling image.".format(tool))
        print(bootstrap(Path(os.path.abspath(sys.argv[1]))))
    except (PreparationError, OSError, UnicodeError) as error:
        message = str(error) if isinstance(error, PreparationError) else (
            "Local CA setup failed; check directory access and keep any existing CA files."
        )
        print(message, file=sys.stderr)
        sys.exit(1)
