#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/infra/local-runtime"

if [ ! -f "$RUNTIME_DIR/.env" ]; then
  cp "$RUNTIME_DIR/.env.example" "$RUNTIME_DIR/.env"
  echo "Created infra/local-runtime/.env from template"
fi

cd "$RUNTIME_DIR"
docker compose --env-file .env up -d --wait

echo "Local runtime is up"
docker compose ps
