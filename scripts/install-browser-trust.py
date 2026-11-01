"""Import only the public local CA into supported per-user Linux NSS stores."""

import os
from pathlib import Path
import re
import shutil
import sys

from importlib.util import module_from_spec, spec_from_file_location


# Share bounded command capture and directory checks with certificate preparation.
sys.dont_write_bytecode = True
specification = spec_from_file_location(
    "local_certificate_preparation", Path(__file__).with_name("prepare-local-cert.py")
)
preparation = module_from_spec(specification)
specification.loader.exec_module(preparation)
PreparationError = preparation.PreparationError
command = preparation.command


def database(directory):
    if (directory / "cert9.db").is_file():
        return "sql:" + str(directory)
    if (directory / "cert8.db").is_file():
        return "dbm:" + str(directory)
    return None


def browser_databases(browser):
    home_directory = Path.home()
    legacy = home_directory / ".pki/nssdb"
    current = Path(os.environ.get("XDG_DATA_HOME") or str(home_directory / ".local/share")) / "pki/nssdb"
    if "LOCAL_CHROME_NSS_DIR" in os.environ:
        selected = Path(os.environ["LOCAL_CHROME_NSS_DIR"])
    else:
        selected = legacy if legacy.exists() or not current.exists() else current
    directories = [selected] if browser == "chrome" else [legacy, current]
    if browser == "all":
        directories.extend((
            home_directory / "snap/chromium/current/.pki/nssdb",
            home_directory / "snap/chromium/current/.local/share/pki/nssdb",
        ))
        for pattern in (
            ".mozilla/firefox/*",
            "snap/firefox/common/.mozilla/firefox/*",
            ".var/app/org.mozilla.firefox/.mozilla/firefox/*",
        ):
            directories.extend(home_directory.glob(pattern))

    chromium_available = False
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        executable = shutil.which(name)
        if executable is None:
            continue
        if executable.startswith("/snap/") or Path(executable).resolve().name == "snap":
            continue
        if name in ("chromium", "chromium-browser") and Path("/snap/chromium").exists():
            continue
        chromium_available = True
    if "LOCAL_CHROMIUM_AVAILABLE" in os.environ:
        chromium_available = os.environ["LOCAL_CHROMIUM_AVAILABLE"] == "1"
    if chromium_available and database(selected) is None:
        # Initialize only the directory Chrome actually selects; preserve data.
        target = selected
        preparation.ensure_directory(target)
        if any(target.iterdir()):
            raise PreparationError("The Chromium NSS directory contains an incomplete store; it was not reset.")
        code, _ = command(["certutil", "-N", "-d", "sql:" + str(target), "--empty-password"])
        if code != 0:
            raise PreparationError("Could not initialize the Chromium certificate store; check user permissions.")
        directories.append(target)
    return sorted({value for path in directories if (value := database(path)) is not None})


def install(root_certificate, required, browser):
    code, root_der = command(["openssl", "x509", "-in", str(root_certificate), "-outform", "DER"])
    if code != 0 or not root_der:
        raise PreparationError("The public local CA could not be read for browser import.")
    code, serial_output = command(["openssl", "x509", "-in", str(root_certificate), "-noout", "-serial"])
    serial = re.fullmatch(rb"serial=([0-9a-fA-F]+)\s*", serial_output)
    if code != 0 or serial is None:
        raise PreparationError("The public local CA serial number could not be read.")
    # Match mkcert's nickname so repeated imports do not add duplicate aliases.
    nickname = "mkcert development CA " + str(int(serial.group(1), 16))
    profiles = browser_databases(browser)
    if not profiles:
        if required:
            raise PreparationError(
                "No supported Linux browser certificate store was found. Close Chrome and rerun "
                "sh scripts/start.sh; check that your browser uses a writable supported user store."
            )
        print("No Linux NSS profile found. Open your browser once, close it and rerun startup if it needs its own store.", file=sys.stderr)
        return
    for profile in profiles:
        code, stored_der = command(["certutil", "-L", "-d", profile, "-n", nickname, "-r"])
        if code == 0 and stored_der != root_der:
            raise PreparationError("An NSS nickname belongs to another certificate; it was not overwritten.")
        code, _ = command([
            "certutil", "-A", "-d", profile, "-t", "C,,", "-n", nickname,
            "-i", str(root_certificate),
        ])
        if code != 0:
            raise PreparationError("Browser CA import failed. Close the browser and check NSS store permissions before retrying.")
        code, stored_der = command(["certutil", "-L", "-d", profile, "-n", nickname, "-r"])
        if code != 0 or stored_der != root_der:
            raise PreparationError("The public CA was not found in a browser store after import.")
        code, _ = command(["certutil", "-V", "-d", profile, "-u", "L", "-n", nickname])
        if code != 0:
            raise PreparationError("Browser-store CA validation failed; startup stopped.")
    print("Verified public CA import in {} Linux browser store(s). Restart the browser.".format(len(profiles)), file=sys.stderr)


if __name__ == "__main__":
    try:
        if len(sys.argv) not in (3, 4) or sys.argv[2] not in ("optional", "required"):
            raise PreparationError("Usage: python3 scripts/install-browser-trust.py ROOT_CA_PEM optional|required [chrome|all]")
        browser = sys.argv[3] if len(sys.argv) == 4 else "all"
        if browser not in ("chrome", "all"):
            raise PreparationError("Browser selection must be chrome or all.")
        os.umask(0o077)
        install(Path(sys.argv[1]), sys.argv[2] == "required", browser)
    except (PreparationError, OSError, UnicodeError) as error:
        message = str(error) if isinstance(error, PreparationError) else (
            "Browser trust setup failed; check certificate-store access and permissions."
        )
        print(message, file=sys.stderr)
        sys.exit(1)
