#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/prod/docker-compose.prod.yml"
PROD_ENV="/etc/mission-control/prod.env"
TARGET_TAG="${1:-}"

if [[ -z "$TARGET_TAG" ]]; then
  echo "Usage: $0 <image-tag>"
  echo "Example: $0 a1b2c3d"
  exit 1
fi

if [[ ! -f "$PROD_ENV" ]]; then
  echo "[ERROR] Missing $PROD_ENV"
  exit 1
fi

cd "$REPO_ROOT"

echo "[INFO] Rolling back to image tag: $TARGET_TAG"
MC_IMAGE_TAG="$TARGET_TAG" docker compose -f "$COMPOSE_FILE" --env-file "$PROD_ENV" up -d --remove-orphans --wait

echo "[INFO] Running smoke checks..."
curl -fsS http://127.0.0.1:5100/healthz >/dev/null
curl -fsS -I http://127.0.0.1:3100 >/dev/null

echo "[OK] Rollback complete"
