#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/dev/docker-compose.dev.yml"
DEV_POSTGRES_PORT="${MC_DEV_POSTGRES_PORT:-55432}"

echo "[INFO] Starting DEV dependency stack (postgres, redis, worker, dapr*)"
echo "[INFO] Using postgres host port: ${DEV_POSTGRES_PORT}"

MC_DEV_POSTGRES_PORT="$DEV_POSTGRES_PORT" docker compose -f "$COMPOSE_FILE" up -d postgres redis worker dapr-placement dapr-worker

echo "[INFO] Stack status:"
MC_DEV_POSTGRES_PORT="$DEV_POSTGRES_PORT" docker compose -f "$COMPOSE_FILE" ps

echo "[OK] DEV dependencies are up"
echo "[NEXT] Run API host-side with:"
echo "  MC_API_DB_ENGINE=postgres MC_API_POSTGRES_DSN='postgresql://mission_control:mission_control_dev@127.0.0.1:${DEV_POSTGRES_PORT}/mission_control' poetry run uvicorn app.main:app --reload --port 5000"
echo "[NEXT] Run WEB host-side with:"
echo "  API_URL=http://127.0.0.1:5000 NEXT_PUBLIC_API_URL=/api npm run dev -- --port 3000"
