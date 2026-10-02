# Local Docker setup

This is the local development setup: Django runs through Gunicorn and React runs
through Vite. Nginx, the built frontend, and HTTPS are the next infrastructure
stage. This setup does not yet meet the subject's HTTPS deployment requirement.

## Prerequisites

- Docker Engine or Docker Desktop with the Docker Compose plugin.
- Run commands from the repository root.
- Docker must be able to write to the host `data/` directory.

Python, Node.js, and application dependencies are installed inside the images.

## Local configuration

If you do not already have a root `.env`, create it from the example:

```sh
cp .env.example .env
```

The local `.env` is ignored by Git; `.env.example` is intended to be committed.
Compose reads these values when preparing the service configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKEND_PORT` | `8000` | Backend port on your computer |
| `FRONTEND_PORT` | `5173` | Frontend port on your computer |

Defaults also work without `.env`. Exported shell variables take precedence over
the file. Both published ports bind to `127.0.0.1`, so this development setup is
accessible from the computer running Docker, rather than other computers.

These variables configure Compose ports only. Django still reads its existing
settings from `backend/config/settings.py`; environment-based secrets, production
debug/host settings, and trusted HTTPS proxy handling require the backend partner's
settings changes. Do not assume putting a Django setting in `.env` changes it.

## Start the project

```sh
docker compose up -d --build
```

This builds the images and starts the services in the background. Backend startup
applies Django migrations to the mounted database before starting Gunicorn. It
uses the existing database when present; it does not copy a starter file over it.

With the default ports, open `http://localhost:5173`. The backend is available at
`http://localhost:8000`. If you change a port in `.env`, use that port in the
browser too.

## Requests and startup

The browser loads Vite on the frontend port. The frontend sends relative `/api/`
requests; Vite forwards them to `http://backend:8000` over Compose's default
network. `backend` is the Docker service name. Changing the host's backend port
does not change this internal address.

The frontend starts after the backend passes its TCP health check, which checks
that something is listening on port 8000. This does not verify every API endpoint
or database operation. The frontend health check checks an HTTP response from `/`;
it does not run browser or application tests. Vite uses `--strictPort` so it exits
instead of silently choosing a port different from the Docker mapping.

Each service uses `restart: unless-stopped`, so Docker restarts an exited service
unless it was explicitly stopped. An unhealthy status alone does not restart a
running container. Both services use Docker's small init process to help forward
termination signals and reap child processes; Gunicorn replaces the startup shell
after migrations finish.

## Database persistence

The host directory `./data` is mounted at `/data` inside the backend container.
Django uses `/data/db.sqlite3`, corresponding to host `data/db.sqlite3`.

- Existing data stays in this host directory when containers are recreated.
- When the database file is absent and the directory is writable, migrations can
  create the SQLite database and its tables.
- Compose no longer depends on the deleted `backend/db.sqlite3` starter file.
- Automatic catalog or account seeding is not part of this Compose setup. An empty
  database needs its initial data supplied separately through the backend's
  supported workflow.
- Database-engine migration, database Git tracking, and upload storage remain
  separate work. Preserve the current database when preparing those changes.

## Inspect, rebuild, and stop

These commands let you inspect service state and recent logs:

```sh
docker compose ps
docker compose logs --tail=50 backend frontend
```

The Dockerfiles copy source into images, so later source edits need a rebuild.
For a frontend-only change with the backend already running:

```sh
docker compose up -d --build --no-deps frontend
```

To stop and remove this project's containers and network:

```sh
docker compose down
```

The host `data/` directory remains. Startup, browser behavior, and persistence
checks still need to be performed; writing this configuration does not verify
their runtime behavior.

## References

- [Docker Compose environment configuration](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/)
- [Docker Compose service options](https://docs.docker.com/reference/compose-file/services/)
