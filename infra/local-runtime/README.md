# Local runtime (Docker + Dapr)

Deterministic local stack for Mission Control story MC-415.

## Topology

- `sqlite` (volume-backed DB file)
- `redis`
- `api` (FastAPI on `:5001`)
- `web` (Next.js on `:3000`)
- `worker` (heartbeat worker validating API + Redis reachability)
- `dapr-placement`
- Dapr sidecars: `dapr-api`, `dapr-web`, `dapr-worker`

CLI stays host-executed (`apps/cli`), not containerized.

## One-command bootstrap

```bash
./infra/local-runtime/up.sh
```

This creates `infra/local-runtime/.env` from `.env.example` when missing and starts all services with health-gated startup (`docker compose up -d --wait`).

## Lifecycle

```bash
./infra/local-runtime/down.sh   # stop runtime, preserve state
./infra/local-runtime/reset.sh  # stop runtime and remove volumes (fresh state)
```

## SQLite durability (backup & restore)

- Persistent DB path inside runtime: `/runtime/sqlite/mission-control.db` (api/web) backed by Docker volume `sqlite-data` (`/data/mission-control.db` in sqlite service).
- API startup now runs strict SQLite migration + integrity checks; startup fails fast on corruption or invalid path.

```bash
# Create verified backup (quick_check must return ok)
./infra/local-runtime/scripts/sqlite-backup.sh

# Restore from backup file and restart dependent services
./infra/local-runtime/scripts/sqlite-restore.sh infra/local-runtime/backups/mission-control-YYYYMMDD-HHMMSS.db
```

If API fails with corruption diagnostics, restore from latest verified backup and restart runtime.

## Health contracts

- `sqlite`: DB file exists in mounted volume.
- `redis`: `redis-cli ping` must return success.
- `api`: `GET /healthz` responds.
- `web`: root page (`/`) responds.
- `worker`: API and Redis reachability checks pass.
- `dapr-*`: tied to app container lifecycles (`network_mode: service:<app>`), started after app readiness.

## Triage for unhealthy services

### `api` unhealthy

1. `docker compose -f infra/local-runtime/docker-compose.yml logs api --tail=200`
2. Validate DB volume mount: `docker compose -f infra/local-runtime/docker-compose.yml exec api ls -la /runtime/sqlite`
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
3. Check sidecar app binding ports (`--app-port`) match app services.
