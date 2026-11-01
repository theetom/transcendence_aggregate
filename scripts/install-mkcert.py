"""Install a checksum-pinned upstream mkcert when the Linux host lacks it."""

import hashlib
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
from urllib.request import urlopen


VERSION = "v1.4.4"
# Verified from the official HTTPS release downloads; never execute before hashing.
RELEASES = {
    "amd64": ("6d31c65b03972c6dc4a14ab429f2928300518b26503f58723e532d1b0a3bbb52", 4788866),
    "arm64": ("b98f2cc69fd9147fe4d405d859c57504571adec0d3611c3eefd04107c7ac00d0", 4633188),
    "arm": ("2f22ff62dfc13357e147e027117724e7ce1ff810e30d2b061b05b668ecb4f1d7", 4763091),
}
MACHINES = {
    "x86_64": "amd64", "amd64": "amd64",
    "aarch64": "arm64", "arm64": "arm64",
    "armv7l": "arm", "armv6l": "arm",
}


def install(directory):
    if platform.system() != "Linux":
        raise ValueError("Automatic mkcert download supports Linux; install mkcert for your platform.")
    architecture = MACHINES.get(platform.machine().lower())
    if architecture is None:
        raise ValueError("No verified mkcert download is configured for this CPU architecture.")
    directory.mkdir(mode=0o755, parents=True, exist_ok=True)
    destination = directory / "mkcert"
    if os.path.lexists(str(destination)):
        raise ValueError("A local mkcert file already exists; it was not overwritten.")

    expected_digest, expected_size = RELEASES[architecture]
    url = "https://github.com/FiloSottile/mkcert/releases/download/{}/mkcert-{}-linux-{}".format(
        VERSION, VERSION, architecture
    )
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".mkcert-", dir=str(directory), delete=False) as output:
            temporary_path = Path(output.name)
            digest = hashlib.sha256()
            size = 0
            with urlopen(url, timeout=30) as response:
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > expected_size:
                        raise ValueError("The mkcert download exceeded its verified size.")
                    digest.update(chunk)
                    output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        if size != expected_size or digest.hexdigest() != expected_digest:
            raise ValueError("The mkcert download failed checksum verification; nothing was installed.")
        os.chmod(temporary_path, 0o755)
        result = subprocess.run(
            [str(temporary_path), "-version"], stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15, check=False,
        )
        if result.returncode != 0 or result.stdout.strip() != VERSION.encode("ascii"):
            raise ValueError("The verified mkcert binary could not run on this machine.")
        # Link creates the destination atomically and refuses a concurrent overwrite.
        os.link(temporary_path, destination)
    finally:
        if temporary_path is not None:
            temporary_path.unlink()
    print("Installed verified mkcert {} in {}".format(VERSION, directory))


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 scripts/install-mkcert.py LOCAL_BIN_DIRECTORY")
        install(Path(os.path.abspath(sys.argv[1])))
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        message = str(error) if isinstance(error, ValueError) else (
            "Could not install mkcert; check HTTPS access and local directory permissions."
        )
        print(message, file=sys.stderr)
        sys.exit(1)
