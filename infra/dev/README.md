# DEV Host-First Runtime (API/Web in VS Code)

Use this mode when you run **API** and **Web** directly on the host (VS Code / terminal), while Docker provides dependencies only.

## What runs in Docker

- `postgres`
- `redis`
- `worker`
- `dapr-placement`
- `dapr-worker`

## Why Postgres port is `55432`

Production stack usually binds Postgres on `5432`.
To avoid collisions, DEV helper scripts default to `55432`.

## Start DEV dependencies

```bash
cd /home/kuba/repos/mission-control
MC_DEV_POSTGRES_PORT=55432 ./infra/dev/up-host-deps.sh
```

## Stop DEV dependencies

```bash
cd /home/kuba/repos/mission-control
MC_DEV_POSTGRES_PORT=55432 ./infra/dev/down-host-deps.sh
```

## Run API on host

```bash
cd /home/kuba/repos/mission-control/services/api
MC_API_DB_ENGINE=postgres \
MC_API_POSTGRES_DSN='postgresql://mission_control:mission_control_dev@127.0.0.1:55432/mission_control' \
poetry run uvicorn app.main:app --reload --port 5000
```

## Run Web on host

```bash
cd /home/kuba/repos/mission-control/apps/web
API_URL=http://127.0.0.1:5000 NEXT_PUBLIC_API_URL=/api npm run dev -- --port 3000
```

## Quick checks

```bash
# deps status
docker compose -f infra/dev/docker-compose.dev.yml ps

# API health
curl -fsS http://127.0.0.1:5000/healthz
```

## Typical failure

`bind: address already in use` on `5432` -> you likely have PROD Postgres running.
Use the DEV port override (`MC_DEV_POSTGRES_PORT=55432`) as shown above.
