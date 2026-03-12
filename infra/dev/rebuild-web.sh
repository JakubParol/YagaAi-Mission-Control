#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/infra/dev"

if [ ! -f "$RUNTIME_DIR/.env" ]; then
  cp "$RUNTIME_DIR/.env.example" "$RUNTIME_DIR/.env"
  echo "Created infra/dev/.env from template"
fi

cd "$RUNTIME_DIR"

echo "Recreating web (+ dapr-web sidecar) for dependency changes..."
docker compose --env-file .env up -d --force-recreate web dapr-web --wait

docker compose --env-file .env ps web dapr-web
