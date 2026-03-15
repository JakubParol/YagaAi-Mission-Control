#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/infra/dev"

if [ ! -f "$RUNTIME_DIR/.env" ]; then
  cp "$RUNTIME_DIR/.env.example" "$RUNTIME_DIR/.env"
  echo "Created infra/dev/.env from template"
fi

cd "$RUNTIME_DIR"

echo "Building API image..."
docker compose --env-file .env build api

"$ROOT_DIR/infra/scripts/run-api-migrations.sh" "$RUNTIME_DIR/docker-compose.yml" "$RUNTIME_DIR/.env"

echo "Rebuilding API (+ dapr-api sidecar)..."
docker compose --env-file .env up -d --force-recreate api dapr-api --wait

docker compose --env-file .env ps api dapr-api
