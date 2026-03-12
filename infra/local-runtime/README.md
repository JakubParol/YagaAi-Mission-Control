# Local runtime (Docker + Dapr)

Deterministic local stack for Mission Control orchestration runtime.

## Topology

- `postgres` (primary persistent DB service)
- `redis`
- `api` (FastAPI on host `:5000`, container `:5100`)
- `web` (Next.js on host `:3000`)
- `worker` (HTTP worker that publishes orchestration heartbeats via Dapr pub/sub and receives API acknowledgements via Dapr service invocation)
- `dapr-placement`
- Dapr sidecars: `dapr-api`, `dapr-web`, `dapr-worker`

CLI stays host-executed (`apps/cli`), not containerized.

## One-command bootstrap

```bash
./infra/local-runtime/up.sh
```

This creates `infra/local-runtime/.env` from `.env.example` when missing and starts all services with health-gated startup (`docker compose up -d --wait`).

`up.sh` also performs explicit Dapr metadata validation on API/Web/Worker sidecars and fails fast when required components are not loaded.

## PostgreSQL runtime defaults

Postgres is the default local persistence path.

- container: `postgres` (`postgres:16-alpine`)
- volume: `postgres-data`
- host port: `${MC_POSTGRES_PORT}` (recommended `55432` to avoid collision with PROD `5432`)
- DB credentials via `.env`:
  - `MC_POSTGRES_DB`
  - `MC_POSTGRES_USER`
  - `MC_POSTGRES_PASSWORD`

API uses:

- `MC_API_DB_ENGINE=postgres`
- `MC_API_POSTGRES_DSN=postgresql://<user>:<pass>@postgres:5432/<db>`

## Dapr component versioning and overrides

Defaults are defined in `infra/local-runtime/.env.example`:

- `MC_DAPR_VERSION=1.14.4` — pins both `daprio/dapr` and `daprio/daprd` images.
- `MC_DAPR_COMPONENTS_PATH=./dapr/components` — mounted component manifest directory.
- `MC_WORKER_PUBLISH_INTERVAL_SECONDS=15` — worker heartbeat publish cadence.

Override strategy:

1. Copy `.env.example` to `.env` (auto-created by `up.sh` if missing).
2. Override values in `.env` for local experiments.
3. Keep component manifests in version control under `infra/local-runtime/dapr/components/` so startup is reproducible across machines.

## Lifecycle

```bash
./infra/local-runtime/down.sh   # stop runtime, preserve state
./infra/local-runtime/reset.sh  # stop runtime and remove volumes (fresh state)
```

## Orchestration smoke suite

Run deterministic orchestration smoke coverage (happy path + retry + dead-letter + watchdog):

```bash
./infra/local-runtime/scripts/orchestration-smoke.py
```

Run against an already running stack:

```bash
./infra/local-runtime/scripts/orchestration-smoke.py --skip-up
```

CI-style (runtime booted separately, non-default API host):

```bash
./infra/local-runtime/scripts/orchestration-smoke.py --skip-up --api-base http://127.0.0.1:5000
```

## PostgreSQL backup/restore

```bash
# Create SQL dump backup
./infra/local-runtime/scripts/postgres-backup.sh

# Restore from SQL dump
./infra/local-runtime/scripts/postgres-restore.sh infra/local-runtime/backups/mission-control-postgres-YYYYMMDD-HHMMSS.sql
```

## Health contracts

- `postgres`: `pg_isready` must pass.
- `redis`: `redis-cli ping` must return success.
- `api`: `GET /healthz` responds.
- `web`: root page (`/`) responds.
- `worker`: `/healthz` responds and reports last Dapr publish/ack state.
- `dapr-*`: tied to app container lifecycles (`network_mode: service:<app>`), started after app readiness.

## Triage for unhealthy services

### `api` unhealthy

1. `docker compose -f infra/local-runtime/docker-compose.yml logs api --tail=200`
2. Verify DB connection values in `infra/local-runtime/.env` (`MC_POSTGRES_*`, DSN inputs).
3. Confirm dependency health: `docker compose -f infra/local-runtime/docker-compose.yml ps`

### `web` unhealthy

1. `docker compose -f infra/local-runtime/docker-compose.yml logs web --tail=200`
2. Ensure API is healthy first (`web` depends on `api`).
3. Check `NEXT_PUBLIC_API_URL` in compose config (`docker compose ... config`).

### `worker` unhealthy

1. `docker compose -f infra/local-runtime/docker-compose.yml logs worker --tail=200`
2. Verify both `api` and `redis` are healthy.
3. Restart worker only: `docker compose -f infra/local-runtime/docker-compose.yml restart worker`

### Dapr sidecar issues

1. `docker compose -f infra/local-runtime/docker-compose.yml logs dapr-placement dapr-api dapr-web dapr-worker --tail=200`
2. Confirm component files are mounted under `/components`.
3. Check sidecar app binding ports (`--app-port`) match app container ports (API 5100, Web 3000, Worker 8000).
4. Run `./infra/local-runtime/up.sh` and verify no `Dapr metadata missing components` error is reported.
