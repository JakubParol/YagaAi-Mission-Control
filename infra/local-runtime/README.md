# Local runtime (Docker + Dapr)

Deterministic local stack for Mission Control stories MC-415 and MC-372.

## Topology

- `sqlite` (volume-backed DB file)
- `redis`
- `api` (FastAPI on `:5001`)
- `web` (Next.js on `:3000`)
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
- `worker`: `/healthz` responds and reports last Dapr publish/ack state.
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
4. Run `./infra/local-runtime/up.sh` and verify no `Dapr metadata missing components` error is reported.

## Failed run triage workflow

Use this workflow when a run looks stuck or failed:

1. Check run status and lease/watchdog state:
   `mc run status --run-id <run-id> --output json`
2. Check orchestration health metrics (queue lag, retries, dead letters, latency):
   `mc run metrics --output json`
3. Tail timeline for failure/watchdog events:
   `mc run tail --run-id <run-id> --event-type orchestration.watchdog.action --max-polls 5 --interval-ms 2000 --output json`
4. Inspect API + worker structured logs for the same `correlation_id`:
   - `docker compose -f infra/local-runtime/docker-compose.yml logs api --tail=300`
   - `docker compose -f infra/local-runtime/docker-compose.yml logs worker --tail=300`
