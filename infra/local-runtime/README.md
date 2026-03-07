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
