#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/infra/dev"

if [ ! -f "$RUNTIME_DIR/.env" ]; then
  cp "$RUNTIME_DIR/.env.example" "$RUNTIME_DIR/.env"
  echo "Created infra/dev/.env from template"
fi

cd "$RUNTIME_DIR"

echo "Building application images..."
docker compose --env-file .env build api web worker

"$ROOT_DIR/infra/scripts/run-api-migrations.sh" "$RUNTIME_DIR/docker-compose.yml" "$RUNTIME_DIR/.env"

echo "Rebuilding/recreating full DEV stack (api, web, worker + sidecars)..."
docker compose --env-file .env up -d --force-recreate --wait

docker compose --env-file .env ps
