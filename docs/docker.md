# Local Docker setup

This is the current local deployment setup: Django runs through
Gunicorn, and the frontend image builds React and serves the generated files
through Nginx over HTTPS. Nginx forwards `/api/` requests to private Django and
supports direct React page navigation and reloads. Plain HTTP redirects to HTTPS.
This targets local evaluation with locally trusted certificates; public hosting
and a complete deployment-readiness review remain separate work.

## Prerequisites

- Docker Engine or Docker Desktop with a current Docker Compose plugin supporting
  `config --format json`, `up --wait`, and `--wait-timeout`.
- Linux with Chrome as the evaluation browser, or WSL with Windows Chrome.
- Run commands from the repository root.
- Your user must be able to write to the host `data/` directory.
- Python 3 on the host for the database-sharing helper.
- Network access for image downloads and build dependencies.
- Permission to write your own Chrome certificate store and trust a local CA.

The launcher needs no host sudo or host certificate packages. It builds a cached
Docker tools image containing Python, OpenSSL, certutil and mkcert. The official
mkcert v1.4.4 binary for x86-64, ARM64 or ARM is checked against its pinned
SHA-256 and size before execution inside the image. These tools and their
dependencies are installed inside Docker, not on the school computer.

Docker must already be installed, running, and accessible by your normal user
through a local Unix socket. Ordinary Docker and local rootless Docker are
supported; remote endpoints and remapped rootful Docker stop with an explanation
because browser-store mounts/ownership cannot be assumed in those configurations.
Keep the working private `.env` available; startup does not generate replacement
credentials, change Docker permissions or bypass machine restrictions.

Python and backend dependencies are installed inside the backend image; the
sharing helper also needs host Python 3. Node.js and frontend dependencies are
used in the frontend build stage; the final frontend image contains Nginx and
the generated website files.

## Local configuration

If you do not already have a root `.env`, create it from the example. If it
already exists, keep its values and add any new settings you want to customize:

```sh
cp .env.example .env
```

The local `.env` is ignored by Git; `.env.example` is intended to be committed.
Before first startup on a new checkout, set private `DJANGO_SECRET_KEY` and
`POSTGRES_PASSWORD` values in `.env`. The example leaves both empty intentionally.
Generate separate values with
Python's standard library, then place it in your ignored file:

```sh
python3 -c 'import secrets; print(secrets.token_urlsafe(64))'
```

Keep your configured key stable during ordinary rebuilds. On October 7, this
computer's previously committed key was replaced in the ignored `.env` with a
fresh private value. It takes effect on the next backend container recreation;
earlier Git history still contains the superseded key. Replacing a Django key
can invalidate Django's built-in administration login sessions, but does not
change account passwords or the recipe website's database-backed login tokens.

The environment example contains six settings: `DJANGO_SECRET_KEY`,
`DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_DB_ENGINE`,
`DJANGO_POSTGRES_DB` and `POSTGRES_PASSWORD`.
Keep real secrets in ignored `.env`; the example leaves both blank.
PostgreSQL is the only supported database. `DJANGO_DB_ENGINE=postgresql` remains
in the example for compatibility with existing setup files. Compose sets the
backend to PostgreSQL directly; this setting is no longer an engine switch.
Port, server-name and certificate-directory settings use Compose defaults;
add an override only when needed.

The configuration settings and defaults are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `FRONTEND_PORT` | `5173` | HTTP port on your computer; redirects to HTTPS |
| `HTTPS_PORT` | `8443` | HTTPS port on your computer |
| `SERVER_NAME` | `localhost` | Nginx server name; must be covered by the certificate |
| `TLS_CERT_DIR` | `./certs` | Host directory containing `server.crt` and `server.key` |
| `DJANGO_SECRET_KEY` | Required; no default | Django signing secret passed only to the backend |
| `DJANGO_DEBUG` | `False` | Enable or disable Django debug responses |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1,backend` | Comma-separated allowed hostnames/IPs, without ports or protocols |
| `DJANGO_DB_ENGINE` | `postgresql` | Compatibility marker in `.env`; Compose always selects PostgreSQL |
| `DJANGO_POSTGRES_DB` | `recipes` | PostgreSQL database selected by the backend; can select a separately restored snapshot |
| `POSTGRES_PASSWORD` | Required; no default | Private password for PostgreSQL, supplied to its service and Django |

The port/host defaults work without `.env`, but both secrets must be supplied
through `.env` or the shell environment. Exported shell variables take precedence
over the file. Both Nginx ports bind to `127.0.0.1`, so this local setup is accessible
from the computer running Docker. Django has no published host port: its port
8000 is used only over Docker's internal network. An old `BACKEND_PORT` value in
an existing `.env` is no longer used.

Compose passes the four Django settings and PostgreSQL connection settings
explicitly into the backend container. The selected database defaults to
`recipes`; `DJANGO_POSTGRES_DB` overrides the backend's `POSTGRES_DB`. The
PostgreSQL service still initializes its original `recipes` database. The local
database user is `recipes`, the Docker hostname is `postgres`, and its internal
port is `5432`. `backend/config/settings.py` reads
them from its process environment;
Django does not open `.env` itself. The Nginx variables configure Compose and its
template. Arbitrary extra settings in `.env` are not automatically passed through.
`DJANGO_DEBUG` accepts true/false, 1/0, yes/no or on/off (case-insensitive); an
unrecognized value fails startup. With debug disabled, Django's real error
responses omit development tracebacks. Set `DJANGO_DEBUG=True` only when you
deliberately need local diagnostic responses.

## One-time local certificate setup

Close Chrome before running `sh scripts/start.sh`. The launcher performs the
certificate setup as your normal user without installing host packages or system
trust. No separate certificate command is required.

On native Linux it imports only the public CA into the selected Chrome NSS
store and verifies that exact certificate there. Chrome uses an existing
`~/.pki/nssdb` directory first; otherwise current Chrome uses
`${XDG_DATA_HOME:-$HOME/.local/share}/pki/nssdb`. The launcher preserves that
selection. On a fresh account with neither store, it initializes the legacy
location supported by old and current Chrome. Partial/nonempty stores are never
reset. This targets the normal Linux Chrome installation used for evaluation;
an isolated browser package or a managed trust policy may need its own permitted
configuration.

Chrome's store selection follows the
[Chromium NSS implementation](https://chromium.googlesource.com/chromium/src/crypto/+/refs/heads/main/nss_util.cc)
and [Linux certificate guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/cert_management.md).

The user's CA is read from `CAROOT`, or from
`${XDG_DATA_HOME:-$HOME/.local/share}/mkcert` by default. An existing valid CA
identity is preserved. A fresh CA is created using an isolated tools-container
home; host/system trust is not installed during generation. The signing key
stays in its protected host CA directory and is mounted read-only only for
site-certificate preparation. The browser-import container receives the public
CA and the selected NSS directory, not the signing key. The tools image build
receives only the whitelisted scripts, with no host certificate files.

Default site files are `certs/server.crt` and `certs/server.key`, covering the
configured `SERVER_NAME`, `localhost` and `127.0.0.1`. They are Git-ignored.
Keep the CA signing key and site private keys private; do not share or commit them.

The certificate directory is mounted read-only into Nginx; certificates and keys
are not included in the image. Missing files/directories prevent direct Compose
startup; the launcher creates them first. Each evaluation computer/browser must
trust the CA that signed the certificate it sees; teammates can create their own
local pairs.

To select another site-certificate directory, set `TLS_CERT_DIR` in `.env` and
run the launcher. It prepares the selected pair and loads it into Nginx. It can
renew a pair in the existing directory, retaining previous files in a protected
`.previous-cert-*` backup.
For a custom address, include that DNS name/IP in the certificate and configure
the corresponding Nginx name, host access, and Django allowed hosts. Other-machine
access is not enabled by changing the certificate alone. Public deployment needs
certificates and trust appropriate to the public domain, rather than this local
mkcert setup.

### Windows browser with a WSL terminal

When the terminal runs in WSL, the launcher targets Windows Chrome. Windows
must trust the public CA that signed the site's certificate; a Linux NSS import
does not establish Windows browser trust.

The launcher performs the Windows current-user import using `certutil.exe` and
`wslpath`. It stops if those interoperability tools are unavailable rather than
claiming success from a Linux store. For manual troubleshooting with the default
CA location, the equivalent WSL command is:

```sh
certutil.exe -user -addstore Root "$(wslpath -w "$HOME/.local/share/mkcert/rootCA.pem")"
```

This uses Windows certutil to import the public `rootCA.pem` into your Windows
user's Trusted Root Certification Authorities. Adjust that public-file path if
you use `CAROOT` or `XDG_DATA_HOME`. No host mkcert is required. Accept the
Windows trust confirmation if one appears, then fully quit Chrome, including
its incognito windows, reopen it, and visit
`https://localhost:8443/`.

The existing server certificate must be signed by this CA and cover the address
you visit. Windows trust does not configure the school computer; a fresh school
checkout should generate its own local certificate and establish trust there.
Native Linux Chrome uses the per-user NSS setup above and needs no Windows
command. This WSL branch assumes Chrome is on Windows.

References: [Windows certificate import](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/certutil#-addstore)
and [Chrome local trust stores](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md#how-does-the-chrome-certificate-verifier-integrate-with-platform-trust-stores-for-local-trust-decisions).

## Start the project

From the repository root, run as your normal user (not `sudo sh`):

```sh
sh scripts/start.sh
```

This one command:

1. Checks local Docker and Compose access, the account mapping, and the resolved
   private configuration. A missing/empty `DJANGO_SECRET_KEY` or
   `POSTGRES_PASSWORD` prevents startup. Your `.env` is not executed; importing
   shared data updates only its two database-selection settings.
2. Builds/reuses the dedicated certificate-tools image with verified mkcert.
   Host Python 3 is required for database sharing. No host OpenSSL, mkcert,
   certutil, GPG or sudo installation is required.
3. Reads the same resolved certificate paths, names and port Compose uses through
   the tools container. Runtime helpers mount only the dedicated directories
   they need; they do not mount your whole home, repository or Docker socket.
4. Validates/preserves the local CA, or creates it if no identity exists. An
   incomplete or invalid existing CA stops setup and needs restoration.
5. Verifies the pair's current CA, matching key, server purpose, SANs/address
   and expiry. It reuses a valid pair with more than 30 days remaining, otherwise
   validates a new pair before saving old files in a protected backup and
   replacing them. Symlink/nonregular paths stop preparation.
6. Imports and verifies the public CA in the selected per-user Linux Chrome NSS
   store. Under WSL it instead imports the public CA into Windows current-user
   trust. Close Chrome before starting and fully reopen it afterward, including
   incognito windows.
7. Builds the backend, starts PostgreSQL, and checks for downloaded shared data.
   A new copy and its recipe/profile photos are imported automatically, and
   local-only recipes and their files are retained before the website switches
   databases. The previous database is preserved.
8. Runs `docker compose up -d --build --wait --wait-timeout 120`, building both
   application images, starting all three services and waiting for container
   health. When a changed certificate must be loaded by an existing Nginx,
   it recreates only the frontend before printing the website address. A pending
   reload marker keeps this requirement across an interrupted/failed startup.
9. Saves the current database to `data/shared-database/shared-data`, referenced
   recipe/profile pictures under `data/shared-database/photos/`, and the matching
   `manifest.json`, ready for an explicit Git commit/push of that whole folder.

Missing base images and app dependencies are downloaded by the image builds.
Repeated runs reuse the tools image, verified certificates, and Docker's build cache.
Run one launcher at a time. Keep certificate backups private; their keys remain
inside protected backup directories and are not copied into the image. The
launcher does not rotate the local root CA. If its public certificate or signing
key needs restoration, it stops rather than replacing that identity.

The native Linux launcher writes only your user Chrome store; it requests no
administrator authentication. Your account must be allowed to write that store
and Chrome must permit local trust. The launcher does not install system trust,
so command-line HTTPS clients may need an explicit public CA file, for example
`curl --cacert "$HOME/.local/share/mkcert/rootCA.pem" https://localhost:8443/`
with default settings. A browser on another computer needs trust there.
The health wait does not check browser trust or every API. On failure, inspect
the error and service logs; a timeout can leave started containers running and
is not automatic rollback.

The subject's printed page 8 requires containerized deployment to run with a
single command; printed page 27 also allows documented tool prerequisites.
This launcher combines user Chrome trust and application startup without host
sudo. Docker access, network access and permission for local browser trust must
already be available on the evaluation machine. It does not establish compliance
for other unfinished tasks.

All three services run in the background. Backend startup applies Django migrations
to its selected database, then runs `collectstatic --noinput` before starting
Gunicorn. Static collection copies Django's admin and
browsable-API assets into the shared static volume; it does not build React. It
uses the existing database when present; it does not copy a starter file over it.

With the default ports, open `https://localhost:8443`. Opening
`http://localhost:5173` redirects there. `http://localhost:8000` is no longer a
published backend address. Use your configured ports if you changed `.env`.

`8443` is a configurable non-privileged host port, chosen to avoid needing port
443 and reduce conflicts with an existing HTTPS service. Nginx still listens on
443 inside its container. HTTPS does not require host port 443. To use the
standard address `https://localhost`, set `HTTPS_PORT=443` in `.env` and rerun the
launcher; the redirect follows that setting. Port 443 must be available, and some
rootless Docker configurations require extra host permission for low ports.
The subject does not mandate 8443 or 443.

If prerequisites and certificates are already configured, direct
`docker compose up -d --build` remains available. The older Makefiles inside
`backend/` and `frontend/` are standalone workflows, not this HTTPS Compose launcher.

## Frontend build and request routing

The frontend Dockerfile first uses Node.js to install dependencies with `npm ci`
and run `npm run build`. It then copies `/app/dist/` into Nginx's website directory
in a separate image stage. Nginx runs HTTPS on container port 443 (host 8443 by
default) and HTTP redirects on container port 80 (host 5173). No Vite development
server runs in this frontend container.

Neither image uses a `.dockerignore` file. The frontend copies its package files,
HTML entry point, Vite configuration, `src/` and `public/`; the backend copies
`manage.py`, the configuration package and each application's Python files and
migrations. Local root dependency folders, build output, environment files and
database copies are not copied into the images. New application packages or
additional build inputs need corresponding Dockerfile copy instructions.

The image copies `frontend/nginx.conf` to
`/etc/nginx/templates/default.conf.template`. At startup, the official Nginx
entrypoint substitutes only `HTTPS_PORT` and `SERVER_NAME` and writes the server
configuration. The filter preserves Nginx variables such as `$host`, `$scheme`,
and `$request_uri`. This allows the redirect to use the actual published HTTPS
port rather than assuming the container's port is the browser's port.

Requests arriving on the HTTPS frontend address follow these rules:

- `/api/` and existing `/admin/` requests go to `http://backend:8000` over the
  Compose network. The full
  original path and query string are preserved, so `/api/recipes/` reaches Django
  as `/api/recipes/`. Methods, request bodies, and headers such as the login
  Authorization token are forwarded. Django error statuses and bodies are
  returned as received instead of being replaced with the React page.
- `/static/` serves collected Django files from the shared static volume.
  Missing files return a real 404 rather than the React page. Nginx mounts this
  volume read-only.
- `/media/` serves uploaded recipe pictures from the shared media volume,
  mounted read-only in Nginx. Missing pictures return a real 404; this does not
  depend on Django debug mode.
- Existing files are served from the generated frontend output. Requests under
  `/assets/` return 404 if the requested compiled file does not exist.
- Other page paths fall back to `index.html`, allowing React Router to display
  pages such as `/login`, `/privacy`, and `/profile/recipes` after direct navigation
  or a refresh. React's existing login and route rules still apply.
- The website's staff dashboard is `/staff`, and individual recipe reviews use
  the full recipe page at `/recipe/<recipe-id>`. These use the React
  page fallback. `/admin/` belongs to
  Django's built-in database administration panel, so the two interfaces no
  longer claim the same address.

The proxy preserves the browser's Host header, including its port, and supplies
forwarded host, client-address, and protocol headers. Nginx sets the protocol to
HTTPS for these API requests, overriding client-supplied protocol headers.
Django's `SECURE_PROXY_SSL_HEADER` recognises the HTTPS origin even though
Nginx-to-Django communication is internal HTTP. Nginx uses
Docker's internal DNS at `127.0.0.11` to resolve the backend service with a
10-second cache so a recreated backend can be found without baking its IP into
the image. Backend downtime can still produce HTTP 502 until it is reachable.

Vite's existing development proxy does not configure this built website. Nginx
now supplies that forwarding. The infrastructure does not add missing backend
endpoints or complete unfinished application features.

## Startup and health checks

PostgreSQL passes a TCP `pg_isready` check before the backend starts. This waits
for its network server, rather than the temporary initialization server. Readiness
alone does not check Django's password. The backend health check performs
`SELECT 1` using Django's selected database and checks Gunicorn's port 8000.
The frontend starts after the backend is healthy. These checks do not verify every
API or all saved data. The frontend health check uses `curl` inside the Nginx
image to check the HTTPS root on port 443. The command uses `--insecure` only
inside this container health check because the user's local CA is not installed
in the image. It confirms an HTTPS response, but does not verify certificate
trust/hostname or application behavior. Browser and external-client checks below
must use normal certificate validation.

Each service uses `restart: unless-stopped`, so Docker restarts an exited service
unless it was explicitly stopped. An unhealthy status alone does not restart a
running container. Frontend/backend use Docker's small init process to help forward
termination signals and reap child processes; Gunicorn replaces the startup shell
after migrations and static collection finish.

## Database persistence

PostgreSQL 17 is the only supported database. Docker keeps its live data in the
named `postgres_data` volume. PostgreSQL sees that same storage at
`/var/lib/postgresql/data` inside its container. This path is not a project
directory: Docker manages the physical storage on this computer. The volume
survives container recreation and ordinary `docker compose down`.

PostgreSQL has no published host port; Django reaches it on Docker's private
network. The backend selects `recipes` by default, or the separately restored
database recorded in `DJANGO_POSTGRES_DB`. New databases receive the existing
Django migrations during startup. Without a shared copy, no recipe/account
seeding is performed automatically.

The host `data/` directory holds the Git-shareable database/photo copy and ignored
local helper state. It is not mounted into the backend or used as the live
database. On the computer where the old SQLite file was retired, it is preserved
privately under `data/database-private/retired-db.sqlite3`; current startup does
not read it or require other computers to have that private file.
SQLite selection, export and migration helpers have been removed.

`POSTGRES_PASSWORD` initializes the database user on the first start with an
empty volume. Changing `.env` afterward does not change that stored password.
Keep it stable; do not delete the volume to solve a credential mismatch.
Standalone Django configuration rejects any engine value other than
`postgresql`; a connection failure stops startup.

`sh scripts/start.sh` automatically loads a newly downloaded
`data/shared-database/shared-data` and retains local-only recipes, their authors,
ingredients, steps, categories and image references. It also retains local
reviews and favorites. The same process loads referenced recipe/profile picture
files into the local media volume and saves the combined database and photos
after startup. Matching recipes are identified by author username, title and
original creation time; the downloaded version wins for an existing match.
Previous local databases remain stored separately. The companion `manifest.json`
checks completeness, project compatibility and file checksums. The shared folder
contains one current `shared-data`, `manifest.json`, and actual picture files
under `photos/<content-hash>.<extension>`; older exported copies are not retained.
The format-3 manifest lists those files. An older format-2 copy remains readable
as database-only data. Run normal startup or export on the main computer once
to produce the first photo-inclusive copy, then commit/push that whole folder.

Python 3 is required. The shared data is unencrypted: no GPG, sharing key or
`--import` argument is needed. Commit/push the shared folder after exporting;
other computers pull it and run the same startup command. Include the entire
`data/shared-database/` folder so added and removed photo files travel with the
database and manifest. Git commit/push/pull remain manual. An unchanged shared
copy preserves the selected local database, and startup restores any missing
downloaded picture files into the media volume. Unchanged records and referenced
photo contents leave the shared files untouched rather than producing needless
Git changes on startup.
Renames, deletions and conflicting edits are not reconciled as a live sync system.
Approval rules are unchanged. There is no separate manual photo-transfer step.
Automatic startup import/export, recipe combination, picture transfer and
unchanged-content handling remain pending user-run verification. Saved-file
checksum checks and source review do not establish that this complete workflow
has passed.

## Django static assets

Compose manages a persistent named volume, normally prefixed with the Compose
project name:

| Volume | Backend path | HTTPS URL | Contents |
| --- | --- | --- | --- |
| `django_static` | `/srv/django/static` | `/static/` | Collected Django admin/API CSS, JavaScript and images |

The backend writes collected assets to this volume; Nginx reads them. The volume
survives container recreation and ordinary `docker compose down`. Static assets
are separate from PostgreSQL's `postgres_data` volume and can be recollected
from the backend image.

User-led static-serving checks remain pending.

## Recipe photo uploads

The recipe-photo integration selectively reuses the picture-feature upload code
while retaining the current database, HTTPS setup, staff approval controls,
manual ingredient/category names and optional empty extra rows. It includes
recipe pictures only; ingredient pictures and their new model/migration are not
imported. The existing RecipeImage table stores the recipe relationship and file
path; picture bytes are saved separately in the media volume.

| Volume | Backend path | Nginx path | HTTPS URL |
| --- | --- | --- | --- |
| `django_media` | `/app/media` | `/srv/django/media` (read-only) | `/media/` |

Django writes uploaded files and Nginx serves them through the same HTTPS site.
The volume survives ordinary container recreation and `docker compose down`.
It is separate from PostgreSQL and collected static assets. Database exports
contain image paths; the sharing helper copies their referenced files from this
volume into `data/shared-database/photos/` alongside the export. Both travel
through the same export, Git delivery and startup/import process. Downloaded
pictures use content-derived paths under `shared/recipes/` and
`shared/profiles/` inside the receiving media volume. Only references in the
separately restored incoming database are adjusted before local recipes are
combined. Existing files are never overwritten, so a local picture with the
same original filename remains intact. Recipe and profile paths are separate
so replacing a profile picture cannot remove an identically pictured recipe.
Local `.env` files and certificates are not part of the shared data folder.
Media URLs are publicly retrievable by anyone who knows the URL;
the recipe-detail API retains its separate pending-recipe access checks.

The form sends multipart data to `POST /api/recipes/add_recipe/`: `title` text,
JSON-string `ingredients`, `categories` and `steps`, and repeated `images` file
fields. The form and backend require one or two valid, nonempty JPEG, PNG, GIF
or WebP photos, each at most 5 MiB. The existing 20 MiB combined-photo guard
remains; the two-photo and per-photo limits are tighter. Nginx allows a 25 MiB
total request to include the recipe text and multipart overhead. The form stops
at two upload fields, and selected photos can be removed or replaced.
Recipe creation now validates and
saves submitted cooking steps through the existing RecipeStep model; verify
their saved contents when reopening the recipe as part of the checks below.

These changes are prepared in source. Run the following checks yourself:

1. Close Chrome and run `sh scripts/start.sh` from the repository root. This
   rebuilds changed images and recreates services with the media volume; it uses
   the existing certificate/database setup and applies existing migrations during
   backend startup. No new recipe-photo migration is included.
2. Sign in over `https://localhost:8443/` (or your configured address). Create a
   recipe with a distinctive title, valid first ingredient/category, two
   instructions and a small picture. Leave extra rows blank to check the
   optional-row behavior.
   After a successful POST, expect a redirect to `/add-recipe/submitted`, showing
   Recipe submitted successfully and explaining that admin approval is pending.
   In Network tools, the POST response should include an `images` list with image
   URLs. Validation, server and network errors should keep you on the form.
   With an ordinary account, choose Go back to profile and confirm Pending
   Approval shows the actual pending count and your submitted recipe cards.
   This list comes from the signed-in user's `/api/me/` response, including each
   recipe's saved `images` URLs. Profile cards should show the first uploaded
   image; missing or failed images keep a placeholder. On a wider screen, three
   compact pending cards should share a row, and adding pending rows should not
   stretch the Favorites or Approved recipes panels. Check the narrower-screen
   layout too. If a photo is absent, inspect its summary `images` entry and open
   that `/media/` URL to distinguish missing response data from a missing file.
3. As staff, open it from the pending queue; alternatively, its author can open
   `/recipe/<recipe-id>`. Confirm the complete picture displays at its
   compact size, centered inside a full-width section, and both instructions
   appear in order. Open its `/media/`
   URL and confirm it returns an image rather than the React page. Approval
   remains a separate staff action; ordinary users must still be denied access
   to other authors' pending recipe details.
4. Confirm missing, empty, invalid and oversized pictures are rejected clearly.
   Try a valid picture between 3 and 5 MiB and a two-photo recipe to check
   forwarding, saving and display. Confirm a third upload field cannot be added
   and replacing, removing and reselecting photos works within the two fields.
   Check a missing `/media/` filename returns 404. API-level validation needs a
   direct multipart request if the form rejects a file before sending; include
   three valid photos to confirm the API rejects the count with HTTP 400. Do not
   count frontend validation as a backend test.
5. Use the normal container removal/recreation procedure below without `-v`,
   then confirm the saved recipe and its image URL still work. Preserve the
   database, media volume and credentials. Share the failing URL, HTTP status and
   relevant redacted logs if a check fails.

## Profile editing and profile-photo uploads

The own-profile editor uses authenticated `PATCH /api/me/` for first name,
last name, bio and an optional `profile_picture` file. Pictures use the same
`django_media` volume and HTTPS `/media/` serving as recipe photos, under
`profile_pictures/`. No new model, migration, volume or server configuration is
required. Photos must be nonempty JPEG, PNG, GIF or WebP files, no larger than
5 MiB; verified format and UUID filenames determine the saved extension.

The following checks are for the user to run after loading the updated backend
and frontend with the normal rebuild/start procedure. They have not been run
by the assistant.

1. Sign in and open `/profile`. Choose Edit profile, change first/last name and
   bio without selecting a new photo, and Save. Confirm the displayed values
   change, existing photo and recipe lists remain, and the saved values survive
   a reload. Check that Cancel discards unsaved text.
2. Choose Edit profile at the bottom right of the information card, select a
   small valid photo in the editor and check the preview. Save, reload, and
   confirm the current account's saved picture loads from
   `/media/profile_pictures/`. Canceling a selected photo
   must leave the stored picture unchanged.
3. Check invalid, empty and oversized pictures show errors without losing the
   existing saved photo or text. A direct authenticated API request is needed
   to check backend validation when the browser form rejects the file first.
   Repeat with a valid replacement photo and with blank names/bio to confirm
   replacement and text clearing are supported.
4. Confirm anonymous updates are rejected. A request attempting to change an
   account ID, username, email, password, staff flag or favorites should receive
   a validation error. The endpoint must update only the account identified by
   its authentication token, regardless of which profile is displayed elsewhere.
5. Check the profile and editor on a narrow screen. The profile picture should
   be vertically centered beside the information on wider screens and centered
   horizontally when stacked. Edit profile should sit at the card's bottom
   right, and Add recipe at the bottom right of the page content. Photo
   selection remains inside Edit profile, with no separate change-photo button.
   Navigate away while previewing or
   saving; no preview should be reported as a confirmed saved upload. After the
   normal service recreation procedure without `-v`, confirm the saved profile
   photo still loads. Preserve existing database/media volumes and credentials.

Photo URLs retain the existing public media-serving policy. This feature adds
owner-only editing; the separate public-user serializer/privacy discussion and
favorites/comment submission remain outside its scope.

## Inspect, rebuild, and stop

These commands let you inspect service state and recent logs:

```sh
docker compose ps
docker compose logs --tail=50 backend frontend
```

The Dockerfiles copy source into images, so later source edits need a rebuild.
For a frontend-only change, rebuild and recreate just the frontend service:

```sh
docker compose up -d --build --no-deps frontend
```

This runs `npm run build` inside the image build and starts Nginx with the updated
files. It does not start, rebuild, or restart the backend. `--no-deps` skips the
backend startup dependency, so it is also suitable for the static-frontend check
below when the backend is stopped.

## User check for step one: built frontend image

Run these commands from the repository root. The assistant has not run them.

1. Build only the frontend image:

   ```sh
   docker compose build frontend
   ```

   Docker downloads missing base images/dependencies as needed, runs `npm ci` and
   `npm run build`, and copies the output into the Nginx image. A successful build
   should show Vite's build output and finish without errors. It does not start
   containers or operate on the database.

2. Start or replace only the frontend container using that image:

   ```sh
   docker compose up -d --no-deps frontend
   ```

   This replaces a running frontend container if needed and serves the newly
   built files. It leaves the backend and its database alone.

3. Inspect the frontend status after allowing about 30 seconds for health checks:

   ```sh
   docker compose ps frontend
   ```

   Expect the frontend to be running and eventually marked healthy, with host
   port 5173 mapped to container port 80 and host 8443 mapped to container 443,
   unless the published ports were customized. Certificate setup is required
   even for this frontend-only check now.

4. Open `https://localhost:8443/` (or your configured HTTPS port), then hard
   refresh. Confirm the site's header, footer, and frontend layout appear instead
   of Nginx's welcome page. In browser Developer Tools > Network, check the main
   document and generated `/assets/` JavaScript/CSS requests return HTTP 200.
   This checks the built frontend files. Use the step-two procedure below to
   check API forwarding and direct-route reloads, and step three for certificate
   trust and redirects.

If the build fails, share the build error. If startup or health fails, inspect
the frontend logs with this read-only command and share the status/log output:

```sh
docker compose logs --tail=50 frontend
```

## User check for step two: API forwarding and page reloads

1. Build the current images and start the services from the repository root:

   ```sh
   docker compose up -d --build
   ```

   This loads the new Nginx configuration and ensures the backend is running.
   Docker may recreate containers whose image/configuration changed. Backend
   startup applies pending migrations to the existing mounted database before
   starting Gunicorn. Do not delete the database to perform this check.

2. Read the service status:

   ```sh
   docker compose ps
   ```

   Wait for all three services to be running and healthy. The backend database/TCP and frontend
   HTTP checks do not establish that the following application checks pass.

3. Open `https://localhost:8443/api/recipes/` (or your configured HTTPS port).
   Expect the actual recipe API response with HTTP 200. In browser Network tools,
   inspect the status/body; Django's browsable API may display the response in an
   HTML interface rather than as plain JSON. Also refresh the homepage and check
   its `/api/recipes/` fetch returns 200 with JSON. The previous Nginx API 404 should
   be resolved, assuming the backend handler itself succeeds.

4. Open `https://localhost:8443/privacy` directly and refresh it. Expect the React
   privacy page to remain visible without a Nginx 404. While signed out, repeat
   with `/login`; an existing saved login token may redirect you to the profile
   according to the frontend's normal behavior.

5. Sign in with an existing account. Confirm the login request goes through HTTPS
   port 8443 at `/api/login/`. Open `/profile`, then `/profile/recipes`, and refresh.
   Inspect `/api/me/` in Network tools: expect HTTP 200 for the signed-in account.
   This checks both token forwarding and direct-page fallback. Do not create an
   account or submit a recipe just to check routing.

6. Open `https://localhost:8443/api/routing-check-not-found/`. Expect a genuine
   Django 404 response, not the frontend's `index.html`. This checks that missing
   backend routes are not concealed by the React fallback. Existing backend
   failures should similarly retain their status and response details.

If any check fails, share the failing URL, HTTP status/body, and service status.
Read recent logs with:

```sh
docker compose logs --tail=50 frontend backend
```

These build/container/browser checks are user-led. The user reported the provided
step-four checks working before PostgreSQL was added. The updated database
configuration still needs the shared-database and complete-infrastructure checks
below.

## User check for step three: HTTPS, trust, and redirect

Use the launcher, then run the following checks yourself.
The assistant has not generated certificates, changed trust stores, or started
the new deployment.

1. Load the current images/services:

   ```sh
   sh scripts/start.sh
   ```

   Close Chrome first. This builds/reuses certificate tools inside Docker, sets
   up user Chrome trust/certificates, rebuilds changed source/configuration, and
   recreates services as needed. It removes the backend's old host-port mapping when that service is
   recreated.
   Backend startup still applies pending existing migrations to the mounted
   database. Existing database contents are not replaced by this configuration.

2. Read status:

   ```sh
   docker compose ps
   ```

   Expect all three services healthy, Nginx's HTTP/HTTPS ports published, and no host
   port mapping to backend 8000. A different unrelated service on host 8000 is not
   controlled by this project.

3. Open `https://localhost:8443/`. Expect your website with no certificate warning.
   Fully reopen Chrome first. If there is a warning, check the launcher's Chrome
   trust-import output, browser restart, and that the requested hostname matches
   the certificate. Do not treat bypassing
   the warning as successful browser-trust verification.

4. Verify HTTP redirects to HTTPS with the same page and query string. This
   read-only request prints response headers:

   ```sh
   curl --head 'http://localhost:5173/privacy?routing=1'
   ```

   Expect HTTP 308 and `Location: https://localhost:8443/privacy?routing=1` with
   default settings. The HTTP endpoint redirects `/api/` paths too; it does not
   forward unencrypted API requests to Django.

5. Inspect browser Network tools on the HTTPS homepage: `/api/recipes/` should
   use HTTPS and return 200, with no mixed-content warnings. Sign in again on
   this HTTPS address and check `/profile` fetches `/api/me/` successfully.
   Browser sessionStorage is separate for HTTP and HTTPS origins, so the old
   HTTP login token is not automatically available here. This is a new browser
   login session, not a request to recreate the account.

6. Directly open/reload `https://localhost:8443/privacy` and, after login,
   `/profile/recipes`. Existing React page behavior should remain. Review the
   browser console for errors; these checks do not certify every app feature.

Share the failing URL/status/message if anything fails, plus read-only logs:

```sh
docker compose logs --tail=50 frontend backend
```

If Chrome still reports a trust error, close Chrome, rerun `sh scripts/start.sh`
as the browser user, and fully restart Chrome. Host certutil is not required.
Report the exact Chrome error and launcher output; connection refusal, certificate
trust errors and HTTP 502 responses need different diagnoses. For a Windows
browser with WSL, check the Windows import above. Do not share the CA private key.
Shared-database and broader deployment checks follow below.
The complete root README is deferred until the finished version.

## User check for step four: backend settings and static serving

The user reported earlier versions of these checks passing before PostgreSQL
was introduced. Repeat them with the current setup; the assistant has not run
the updated checks.

1. Keep the existing `.env` and database. Ensure the required example settings are
   present; this computer's file has been prepared without changing existing
   entries. On a new machine, copy `.env.example` to `.env`, then fill the blank
   secrets in `.env`; keep the example free of real credentials.
   PostgreSQL is selected automatically. An existing
   `DJANGO_DB_ENGINE=postgresql` line may remain as a compatibility marker.
2. Run `sh scripts/start.sh` from the repository root. It rebuilds/recreates
   changed images/services, applies existing migrations to the selected database, and collects
   Django assets. It performs the documented user Chrome trust setup with tools
   inside Docker.
3. Read `docker compose ps` and `docker compose logs --tail=50 backend frontend`.
   Expect healthy services and static-collection output before Gunicorn starts.
   Do not share `.env`, private keys or full resolved Compose configuration.
4. Open `https://localhost:8443/api/recipes/` and
   `https://localhost:8443/static/rest_framework/css/default.css`. Expect a working
   API and HTTP 200 for the CSS file. Open `/admin/login/`; its page and
   `/static/admin/css/base.css` should load through HTTPS.
5. Check the existing account login/profile and direct React page reloads.
   Open `/api/step-four-not-found/` and `/static/step-four-not-found.css`;
   expect genuine 404s rather than React HTML.
   With `DJANGO_DEBUG=False`, API error pages should omit development tracebacks.
Use your configured HTTPS port if different. Share any failing URL/status and
the relevant service error. Shared-database and persistence checks follow below.

## User check: staff and Django admin addresses

The route separation is implemented in source; browser checks remain user-run.

1. Rebuild/recreate the frontend from the repository root:

   ```sh
   docker compose up -d --build --no-deps --wait --wait-timeout 120 frontend
   ```

   This loads the new routes and the saved friendly login-message change. The
   running backend/PostgreSQL services are not rebuilt by this command.
2. Directly open `https://localhost:8443/staff` and refresh. Expect the website's
   pending-recipe page with its normal header/footer, rather than Django's
   administration interface. Staff accounts can load the queue; other accounts
   should see the sign-in or admin-only message.
3. As staff, open an actual pending recipe from that list and refresh its
   `/recipe/<recipe-id>` address. Expect the full recipe and its
   **Back to pending recipes** link to `/staff`. The connected approval flow
   also requires the backend rebuild/migration described in
   [staff-api.md](staff-api.md).
4. Open `https://localhost:8443/admin/login/` in a private browser window. Expect
   Django's administration login page and working `/static/admin/` assets.

Use your configured HTTPS port if different. This fixes address routing; recipe
queue loading, approval/rejection and staff permissions are implemented in
source and still need the user-run checks in [staff-api.md](staff-api.md).
No redirect from the old website `/admin` addresses is added,
because those addresses now belong to Django.

## User check: PostgreSQL and sharing between computers

These are user-run checks, not completed results. The automatic database/photo
workflow remains runtime-unverified. Keep both computers' `.env`, databases,
media volumes and certificate pairs. Do not delete a volume or discard a local
shared file to resolve a failed check.

1. On the main computer, note an existing recipe's title, author and pictures,
   plus a profile picture if available, then run:

   ```sh
   sh scripts/start.sh
   ```

   This loads the current configuration, starts the services, applies existing
   migrations and exports the selected PostgreSQL database and its referenced
   photo files. The first run upgrades an older database-only saved copy. Confirm
   the website opens, an existing account can log in, and the expected recipes
   and pictures remain. Check that `data/shared-database/manifest.json` has
   `format_version: 3` and `media_included: true`, with the expected picture files
   under `data/shared-database/photos/` when saved records reference pictures.
2. Confirm the actual Django database connection:

   ```sh
   docker compose exec -T backend python manage.py shell --verbosity 0 -c 'from django.db import connection; connection.ensure_connection(); print(connection.vendor)'
   ```

   Expect `postgresql`. Read `docker compose ps` and
   `docker compose logs --tail=50 postgres backend frontend`; expect all three
   healthy and no startup/import errors.
3. If records or pictures changed after startup finished, save them before
   sharing. With the app running, use this shortcut from the project root:

   ```sh
   sh scripts/export.sh
   ```

   This exports the current database and referenced recipe/profile photos to
   `data/shared-database/` using the existing exporter. Run it before staging,
   committing and pushing that whole folder. Startup exports once; it does not
   continuously update the shared folder.
4. Review and send the main computer's current database and pictures through Git:

   ```sh
   git status --short
   git add data/shared-database
   git commit -m "data: update shared database and photos"
   git push origin frontend-side_Roh
   ```

   Stage the whole shared folder, including picture additions and deletions.
   If there are no staged changes, skip the commit; no empty commit is needed.
   Git delivery is manual and separate from startup.
5. On the receiving computer, note any existing local recipe's title, author and
   pictures, keep its local configuration, and inspect `git status --short` before:

   ```sh
   git switch frontend-side_Roh
   git pull --ff-only origin frontend-side_Roh
   sh scripts/start.sh
   ```

   Each computer needs its own valid `.env`, Docker and host Python 3. No sharing
   key or `--import` flag is needed. If Git reports local changes or conflicts,
   preserve those files and review the message before proceeding.
6. Confirm both the main computer's recipe and the receiver's prior local recipe
   appear with their ingredients, steps and categories. Use an approved recipe
   for public-list checks; pending recipes require an existing owner/staff view.
   Check every picture in the main recipe's gallery, the receiver's existing
   recipe pictures and a downloaded profile picture. Reload their pages and
   open a picture URL directly to confirm actual images load. Check an existing
   login and suitable reviews/favorites. Approval rules are unchanged.
7. Run `sh scripts/start.sh` again and confirm recipes remain without added
   duplicates and pictures still load after restart. Compare the whole shared
   folder immediately before and after another repeat run with no record/photo
   changes or intervening logins: an already-upgraded, unchanged copy should
   stay unchanged. The first merge may legitimately change the folder and an
   older manifest may be upgraded once.
8. To check sharing the combined result back, send the receiver's shared folder
   with the same export-if-needed, review, commit and push steps. Then pull and
   run startup on the main computer. Confirm both recipes and pictures remain
   there too.
   Work sequentially for this check. Conflicting edits/deletions and simultaneous
   Git changes to the database file are not resolved as live synchronization.
9. To check a later picture change, replace a profile picture or create another
   recipe with pictures on one computer. Run the same export, whole-folder
   commit/push, receiving pull and normal startup steps. Confirm the changed
   profile picture or new recipe gallery appears on the other computer while
   the previous local-only recipe and its pictures remain. No separate photo
   command is needed.

If a check fails, keep both computers' current data. Record the failing command
or URL and relevant redacted error; do not reset files or remove databases.

## Complete Docker-infrastructure checks

Run these yourself after the PostgreSQL/startup checks above. They cover
deployment behavior; README, policy content and deferred application fixes
remain separate.

1. Run `sh scripts/start.sh` again. It should reuse a still-valid, matching pair
   and stored databases, build changed source if needed, and leave all three
   services healthy. An invalid or nearly expired pair is replaced with a
   verified pair, with previous files retained in a protected backup.
2. Check `docker compose ps`: only frontend HTTP/HTTPS ports are published;
   backend 8000 and PostgreSQL 5432 remain private. Confirm the connection vendor
   is still `postgresql` using the connection command above.
3. Repeat step three's HTTP 308/path/query redirect, browser trust, HTTPS API,
   login/profile and direct React reload checks. Repeat step four's Django admin
   login, static CSS and genuine missing API/static 404 checks. Browser console
   should show no new deployment errors or mixed-content warnings.
   Repeat the staff/Django-address direct-navigation and refresh checks above.
4. Check persistence through normal removal/recreation:

   ```sh
   docker compose down
   docker compose up -d --wait --wait-timeout 120
   ```

   Use no `-v`. Confirm all three services recover, old accounts/recipes remain,
   and an existing account can still log in. Restarting containers must not
   initialize a fresh database or replace your certificates.
5. Review startup/service logs for errors. Record the command, URL, status and
   relevant redacted error if a check fails; do not share secrets or private exports.

Fresh-machine/school startup still requires confirmed Docker, installation/network
and browser-trust permissions. The website staff routes now use `/staff` and
the full `/recipe/<recipe-id>` page, while Django keeps `/admin/`;
verify this separation after
the frontend rebuild. These pending checks prevent claiming the whole deployment
is fully verified merely because source preparation is complete.

## Stop the project

To stop and remove this project's containers and network:

```sh
docker compose down
```

The host `data/` directory and the `postgres_data`, `django_static` and
`django_media` named volumes remain. Do not add `-v`: it would remove named
volumes, including PostgreSQL data and uploaded recipe pictures.
Runtime completion depends on the user-run checks above.

## References

- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Official Nginx image](https://hub.docker.com/_/nginx)
- [Nginx proxy configuration](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)
- [Nginx file and page fallback](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files)
- [Docker container DNS](https://docs.docker.com/engine/network/#dns-services)
- [Docker Compose environment configuration](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/)
- [Docker Compose service options](https://docs.docker.com/reference/compose-file/services/)
- [Docker Compose resolved configuration](https://docs.docker.com/reference/cli/docker/compose/config/)
- [Docker Compose build/start and health wait](https://docs.docker.com/reference/cli/docker/compose/up/)
- [Nginx HTTPS configuration](https://nginx.org/en/docs/http/configuring_https_servers.html)
- [mkcert installation and local browser trust](https://github.com/FiloSottile/mkcert)
- [Django trusted HTTPS proxy header](https://docs.djangoproject.com/en/6.0/ref/settings/#secure-proxy-ssl-header)
- [Django deployment settings](https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/)
- [Django static-file deployment](https://docs.djangoproject.com/en/6.0/howto/static-files/deployment/)
- [Nginx file aliases](https://nginx.org/en/docs/http/ngx_http_core_module.html#alias)
- [Compose named volumes](https://docs.docker.com/reference/compose-file/volumes/)
- [Official PostgreSQL image and persistent-data settings](https://hub.docker.com/_/postgres)
- [PostgreSQL image initialization source](https://github.com/docker-library/postgres/blob/master/docker-entrypoint.sh)
- [Django PostgreSQL requirements](https://docs.djangoproject.com/en/6.0/ref/databases/#postgresql-notes)
