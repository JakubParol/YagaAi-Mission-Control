#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/infra/local-runtime"

cd "$RUNTIME_DIR"
docker compose --env-file .env down --remove-orphans

echo "Local runtime is down"
