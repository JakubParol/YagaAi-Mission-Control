#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/dev/docker-compose.dev.yml"
DEV_POSTGRES_PORT="${MC_DEV_POSTGRES_PORT:-55432}"

echo "[INFO] Stopping DEV dependency stack"
MC_DEV_POSTGRES_PORT="$DEV_POSTGRES_PORT" docker compose -f "$COMPOSE_FILE" down --remove-orphans

echo "[OK] DEV dependencies stopped"
