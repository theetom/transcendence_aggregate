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
- Run commands from the repository root.
- Docker must be able to write to the host `data/` directory.
- Network access for missing host packages, image downloads, and app dependencies.
- Permission to install missing host packages and a local certificate authority.
  The launcher may request your administrator password.

The launcher automatically installs missing mkcert, Python 3 (for configuration
reading and the database-transfer helpers), and Linux certutil through apt on
Debian/Kali/Ubuntu. On other platforms, install these host tools through your
platform's supported instructions first. Docker itself must already be installed,
running, and accessible by your normal user. The launcher does not install Docker,
change Docker permissions, or bypass evaluation-machine restrictions.

Python and backend dependencies are installed inside the backend image. Node.js
and frontend dependencies are used in the frontend build stage; the final
frontend image contains Nginx and the generated website files.

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

The minimal environment files now contain five settings: `DJANGO_SECRET_KEY`,
`DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_DB_ENGINE` and `POSTGRES_PASSWORD`.
Keep real secrets in ignored `.env`; the example leaves both blank. This computer's
existing settings were preserved, a private database password was added, and
`DJANGO_DB_ENGINE=sqlite` remains selected until the transfer below succeeds.
Port, server-name and certificate-directory settings use Compose defaults;
add an override only when needed.

Compose reads these values when preparing the service configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `FRONTEND_PORT` | `5173` | HTTP port on your computer; redirects to HTTPS |
| `HTTPS_PORT` | `8443` | HTTPS port on your computer |
| `SERVER_NAME` | `localhost` | Nginx server name; must be covered by the certificate |
| `TLS_CERT_DIR` | `./certs` | Host directory containing `server.crt` and `server.key` |
| `DJANGO_SECRET_KEY` | Required; no default | Django signing secret passed only to the backend |
| `DJANGO_DEBUG` | `False` | Enable or disable Django debug responses |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1,backend` | Comma-separated allowed hostnames/IPs, without ports or protocols |
| `DJANGO_DB_ENGINE` | `sqlite` | Use `sqlite` before transfer; `postgresql` after successful comparison |
| `POSTGRES_PASSWORD` | Required; no default | Private password for PostgreSQL, supplied to its service and Django |

The port/host defaults work without `.env`, but both secrets must be supplied
through `.env` or the shell environment. Exported shell variables take precedence
over the file. Both Nginx ports bind to `127.0.0.1`, so this local setup is accessible
from the computer running Docker. Django has no published host port: its port
8000 is used only over Docker's internal network. An old `BACKEND_PORT` value in
an existing `.env` is no longer used.

Compose passes the four `DJANGO_` variables and PostgreSQL connection settings
explicitly into the backend container. Database/user are `recipes`, the Docker
hostname is `postgres`, and its internal port is `5432`; these fixed connection
settings do not need extra `.env` entries. `backend/config/settings.py` reads
them from its process environment;
Django does not open `.env` itself. The Nginx variables configure Compose and its
template. Arbitrary extra settings in `.env` are not automatically passed through.
`DJANGO_DEBUG` accepts true/false, 1/0, yes/no or on/off (case-insensitive); an
unrecognized value fails startup. With debug disabled, Django's real error
responses omit development tracebacks. Set `DJANGO_DEBUG=True` only when you
deliberately need local diagnostic responses.

## One-time local certificate setup

The single-command launcher below performs this setup automatically. These manual
steps are an alternative for troubleshooting or for machines where automated
package installation is not permitted; they are not required before the launcher.

These commands change local dependencies, certificate trust, and certificate
files; they are setup instructions for you to run, not assistant-run tests.

1. Ensure mkcert and certutil are installed. mkcert was found on this computer,
   while certutil was absent during source preparation. On Debian/Kali/Ubuntu,
   install the browser trust helper if missing:

   ```sh
   sudo apt install libnss3-tools
   ```

   For another machine/platform, follow the official mkcert installation guide
   linked at the end. The Docker images do not install host browser tools.

2. Create/install your local certificate authority into the system and supported
   browser trust stores, running as your normal user:

   ```sh
   mkcert -install
   ```

   It may request administrator authentication to update system trust. Restart
   the browser after installation. Keep mkcert's root CA private key private;
   never put it in the image, share it with teammates, or commit it.

3. From the repository root, generate this site's certificate and private key:

   ```sh
   sh scripts/create-local-cert.sh
   ```

   This writes `certs/server.crt` and `certs/server.key` for `localhost` and
   `127.0.0.1`. The directory is Git-ignored, and the key has restrictive
   permissions. The script refuses to overwrite an existing certificate/key.
   If both already exist and are still valid for your address, use them.

The certificate directory is mounted read-only into Nginx; certificates and keys
are not included in the image. Missing files/directories prevent direct Compose
startup; the launcher creates them first. Each evaluation computer/browser must
trust the CA that signed the certificate it sees; teammates can create their own
local pairs.

To use a different certificate directory or names, supply them explicitly:

```sh
sh scripts/create-local-cert.sh ./certs/renewed localhost 127.0.0.1
```

Then set `TLS_CERT_DIR=./certs/renewed` in `.env`. This also provides a renewal
path that preserves the old pair; recreate the frontend container to load it.
For a custom address, include that DNS name/IP in the certificate and configure
the corresponding Nginx name, host access, and Django allowed hosts. Other-machine
access is not enabled by changing the certificate alone. Public deployment needs
certificates and trust appropriate to the public domain, rather than this local
mkcert setup.

## Start the project

From the repository root, run as your normal user (not `sudo sh`):

```sh
sh scripts/start.sh
```

This one command:

1. Checks Docker and Compose access.
2. Installs missing certificate tools and the small host configuration parser
   dependency through apt when needed on Debian/Kali/Ubuntu.
3. Reads the same resolved settings Compose uses, without overwriting or executing
   your `.env`. A missing/empty `DJANGO_SECRET_KEY` or `POSTGRES_PASSWORD` prevents startup.
4. Creates a certificate pair if neither file exists, or reuses an existing pair.
   It refuses incomplete/empty/unreadable pairs and never overwrites certificates.
5. Installs/checks your local CA trust with `mkcert -install`.
6. Runs `docker compose up -d --build --wait --wait-timeout 120`, building both
   application images, starting all three services and waiting for container
   health before printing the website address.

Missing base images and app dependencies are downloaded by the image builds.
Repeated runs reuse installed tools, certificates, and Docker's build cache.
Existing certificates still need to be valid for your address and signed by a CA
your browser trusts; the launcher does not renew or verify an existing pair.
Restart your browser after first-time trust setup. The health wait does not check
browser trust or every API. On failure, inspect the error and service logs; a
timeout can leave started containers running and is not automatic rollback.

The subject's printed page 8 requires containerized deployment to run with a
single command; printed page 27 also allows documented tool prerequisites.
This launcher combines local setup and application startup, but cannot supply
administrator rights or internet access on a locked-down evaluation machine.
Confirm those prerequisites in advance rather than relying on a certificate
warning bypass. It does not establish compliance for other unfinished tasks.

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
- Existing files are served from the generated frontend output. Requests under
  `/assets/` return 404 if the requested compiled file does not exist.
- Other page paths fall back to `index.html`, allowing React Router to display
  pages such as `/login`, `/privacy`, and `/profile/recipes` after direct navigation
  or a refresh. React's existing login and route rules still apply.
- The website's staff dashboard is `/staff`, and individual recipe reviews use
  `/staff/review/<slug>`. These use the React page fallback. `/admin/` belongs to
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

The host directory `./data` is mounted at `/data` inside the backend container.
With `DJANGO_DB_ENGINE=sqlite`, Django uses `/data/db.sqlite3`, corresponding to
host `data/db.sqlite3`.

- Existing data stays in this host directory when containers are recreated.
- When the database file is absent and the directory is writable, migrations can
  create the SQLite database and its tables.
- Compose no longer depends on the deleted `backend/db.sqlite3` starter file.
- Automatic catalog or account seeding is not part of this Compose setup. An empty
  database needs its initial data supplied separately through the backend's
  supported workflow.
- Database-engine migration and database Git tracking remain separate work.
  Preserve the current database when preparing those changes.

The PostgreSQL service, Python driver and connection settings are implemented in
source. PostgreSQL 17 stores data in the named `postgres_data` volume mounted at
`/var/lib/postgresql/data`. It has no published host port; Django reaches it on
Docker's private network. Normal startup starts PostgreSQL even while Django
still selects SQLite. It does not transfer or replace the SQLite data.

`POSTGRES_PASSWORD` initializes the database user on the first start with an
empty volume. Changing `.env` afterward does not change that stored password.
Keep it stable; do not delete the volume to solve a credential mismatch.
Database selection rejects unknown values and does not fall back to SQLite
when a PostgreSQL connection fails.

## Django static assets

Compose manages a persistent named volume, normally prefixed with the Compose
project name:

| Volume | Backend path | HTTPS URL | Contents |
| --- | --- | --- | --- |
| `django_static` | `/srv/django/static` | `/static/` | Collected Django admin/API CSS, JavaScript and images |

The backend writes collected assets to this volume; Nginx reads them. The volume
survives container recreation and ordinary `docker compose down`. Static assets
are separate from the database at host `data/db.sqlite3` and can be recollected
from the backend image.

Upload functionality and image-storage decisions remain with the backend partners.
The step-four media-root, media-volume and media-serving configuration was removed
at the user's request. User-led static-serving checks remain pending.

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
configuration still needs the step-five and complete-infrastructure checks below.

## User check for step three: HTTPS, trust, and redirect

Use the launcher, then run the following checks yourself.
The assistant has not generated certificates, changed trust stores, or started
the new deployment.

1. Load the current images/services:

   ```sh
   sh scripts/start.sh
   ```

   This installs missing host certificate tools where supported, sets up local
   trust/certificates, rebuilds changed source/configuration, and recreates services
   as needed. It removes the backend's old host-port mapping when that service is
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
   If there is a warning, check mkcert trust installation, browser restart, and
   that the requested hostname matches the certificate. Do not treat bypassing
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

If Chrome still reports a trust error after mkcert installation, ensure certutil
was installed before `mkcert -install`, rerun that trust installation as the same
user that generated the certificate, and restart Chrome. Do not share the CA
private key. PostgreSQL transfer and broader deployment checks follow below.
The complete root README is deferred until the finished version.

## User check for step four: backend settings and static serving

The user reported these checks passing before step five. Repeat them after
PostgreSQL activation; the assistant has not run them.

1. Keep the existing `.env` and database. Ensure the five example settings are
   present; this computer's file has been prepared without changing existing
   entries. On a new machine, copy `.env.example` to `.env`, then fill the blank
   secrets in `.env`; keep the example free of real credentials. Keep
   `DJANGO_DB_ENGINE=sqlite` until the transfer has been compared.
2. Run `sh scripts/start.sh` from the repository root. It rebuilds/recreates
   changed images/services, applies existing migrations to the selected database, and collects
   Django assets. It can perform the documented host trust/tool setup.
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
the relevant service error. PostgreSQL activation and data transfer are next;
the current startup continues using the existing SQLite database.

## User check: staff and Django admin addresses

The route separation is implemented in source; browser checks remain user-run.

1. Rebuild/recreate the frontend from the repository root:

   ```sh
   docker compose up -d --build --no-deps --wait --wait-timeout 120 frontend
   ```

   This loads the new routes and the saved friendly login-message change. The
   running backend/PostgreSQL services are not rebuilt by this command.
2. Directly open `https://localhost:8443/staff` and refresh. Expect the website's
   existing recipe-review dashboard with its normal header/footer and empty
   queue message, rather than Django's administration interface.
3. Open `https://localhost:8443/staff/review/route-check` and refresh. Expect the
   website's existing submission-not-loaded page. Its **Back to staff page** link
   should return to `/staff`.
4. Open `https://localhost:8443/admin/login/` in a private browser window. Expect
   Django's administration login page and working `/static/admin/` assets.

Use your configured HTTPS port if different. This fixes address routing; recipe
queue loading, approval/rejection and staff permissions remain separate
application work. No redirect from the old website `/admin` addresses is added,
because those addresses now belong to Django.

## Step five: transfer existing data and activate PostgreSQL

Source preparation is complete; transfer and runtime checks are user-run and
have not been executed by the assistant. Keep your current `.env`, Django key,
SQLite file and certificate pair. Do not run `docker compose down -v`.

1. Finish or stop any other program writing to `data/db.sqlite3`. The helper stops
   this project's frontend/backend, but cannot stop external SQLite writers.
   Keep `DJANGO_DB_ENGINE=sqlite` in `.env` and remove any exported shell override
   for that variable. Do not create accounts or edit recipes until cutover finishes.
2. From the repository root, run:

   ```sh
   sh scripts/migrate-postgres.sh
   ```

   This builds the backend with its PostgreSQL driver, starts PostgreSQL and checks
   for existing application records before applying any migrations. A nonempty
   target is refused. It then applies existing Django migrations and checks again
   before importing. It stops the website, creates a SQLite backup including
   committed WAL data, exports from that backup, imports the records, then exports
   PostgreSQL and compares saved fields, application IDs and relationships.
   Timestamps keep their full precision. Django content-type/permission registry
   IDs may differ and are matched by their names; known unordered relationship
   lists are compared without depending on order. No account passwords or recipe
   values are printed by the comparison.

   Private backup, exports and import/error logs are saved under a new
   `data/postgres-transfer/transfer.*` directory ignored by Git. Those files
   include account information and should stay private. The original SQLite
   database is untouched. Nothing is flushed, automatically cleaned or silently
   skipped. The comparison checks Django-exported records, not unknown legacy
   SQLite tables or uploaded-file bytes; the original and full SQLite backup
   preserve all SQLite tables too. Upload storage remains partner-owned.

3. Continue only if the helper prints **All exported records, application IDs and
   relationships match** and **Transfer comparison passed**. Frontend/backend
   remain stopped and `.env` still selects SQLite. If anything fails, read the
   indicated private logs locally and share only the relevant redacted error.
   Do not retry by deleting data or suppressing invalid rows. PostgreSQL may
   reject old SQLite values; that requires review, not automatic alteration.
4. Change this one line in the existing `.env`:

   ```dotenv
   DJANGO_DB_ENGINE=postgresql
   ```

   Then recreate the backend/frontend with their updated configuration:

   ```sh
   docker compose up -d --wait --wait-timeout 120 backend frontend
   ```

   `docker compose restart` alone does not load changed environment values.
   Keep the original SQLite and private backup after activation.
5. Confirm the actual Django database connection:

   ```sh
   docker compose exec -T backend python manage.py shell --verbosity 0 -c 'from django.db import connection; connection.ensure_connection(); print(connection.vendor)'
   ```

   Expect `postgresql`. Read `docker compose ps` and
   `docker compose logs --tail=50 postgres backend frontend`; expect all three
   healthy and no startup/import errors.
6. Open the website over HTTPS and sign in to an existing account. Check its
   profile, existing recipes, categories/ingredients and recipe preparation data
   against what worked before transfer. An already-incomplete application feature
   is still a deferred application card. Then create one temporary account through
   signup to confirm new records can be saved after importing IDs; keep its details
   for the persistence check below.

If transfer fails before cutover, `.env` remains SQLite; after reviewing the error,
you can resume it with `docker compose up -d --wait --wait-timeout 120 backend frontend`.
If activation fails before anyone writes to PostgreSQL, restore the selector to
`sqlite` and run that same recreation command. After new PostgreSQL writes, returning
to the old SQLite file would omit those new records: stop and reconcile/back up
the PostgreSQL data before any rollback. A failed comparison after a successful
import leaves PostgreSQL records present; the helper will refuse a new import over
them rather than erase or overwrite them.

## Complete Docker-infrastructure checks after step five

Run these yourself after transfer/cutover passes. They cover deployment behavior;
README, policy content and deferred application fixes remain separate.

1. Run `sh scripts/start.sh` again. It should reuse the certificate pair and stored
   databases, build changed source if needed, and leave all three services healthy.
2. Check `docker compose ps`: only frontend HTTP/HTTPS ports are published;
   backend 8000 and PostgreSQL 5432 remain private. Confirm the connection vendor
   is still `postgresql` using the command above.
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
   and the temporary account from step five can still log in. Restarting containers
   must not initialize a fresh database or replace your certificates.
5. Review startup/service logs for errors. Record the command, URL, status and
   relevant redacted error if a check fails; do not share secrets or private exports.

Fresh-machine/school startup still requires confirmed Docker, installation/network
and browser-trust permissions. The website staff routes now use `/staff` and
`/staff/review/<slug>`, while Django keeps `/admin/`; verify this separation after
the frontend rebuild. These pending checks prevent claiming the whole deployment
is fully verified merely because source preparation is complete.

## Stop the project

To stop and remove this project's containers and network:

```sh
docker compose down
```

The host `data/` directory, `postgres_data` and the static named volume remain.
Do not add `-v`: it would remove named volumes, including PostgreSQL data.
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
- [Django serialization and natural keys](https://docs.djangoproject.com/en/6.0/topics/serialization/)
- [Django JSON encoder source](https://github.com/django/django/blob/stable/6.0.x/django/core/serializers/json.py)
