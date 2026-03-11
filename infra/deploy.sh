#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/prod/docker-compose.prod.yml"
PROD_ENV="/etc/mission-control/prod.env"
PROJECT_NAME="mission-control-prod"

if [[ ! -f "$PROD_ENV" ]]; then
  echo "[ERROR] Missing $PROD_ENV"
  echo "Create it from $REPO_ROOT/infra/env/prod.env.example"
  exit 1
fi

cd "$REPO_ROOT"

CURRENT_SHA="$(git rev-parse --short HEAD)"
PREVIOUS_SHA="$(git rev-parse --short HEAD~1 2>/dev/null || echo "$CURRENT_SHA")"

echo "[INFO] Deploying commit $CURRENT_SHA"

echo "[INFO] Building production images..."
DOCKER_BUILDKIT=1 MC_IMAGE_TAG="$CURRENT_SHA" docker compose -f "$COMPOSE_FILE" --env-file "$PROD_ENV" build

echo "[INFO] Starting/updating production stack..."
MC_IMAGE_TAG="$CURRENT_SHA" docker compose -f "$COMPOSE_FILE" --env-file "$PROD_ENV" up -d --remove-orphans --wait

echo "[INFO] Running smoke checks..."
curl -fsS http://127.0.0.1:5100/healthz >/dev/null
curl -fsS -I http://127.0.0.1:3100 >/dev/null

echo "[INFO] Smoke checks passed"
echo "[INFO] Runtime status (docker compose ps):"
MC_IMAGE_TAG="$CURRENT_SHA" docker compose -f "$COMPOSE_FILE" --env-file "$PROD_ENV" ps

echo "[INFO] API /healthz response:"
curl -fsS http://127.0.0.1:5100/healthz
echo

echo "[INFO] WEB headers:"
curl -fsS -I http://127.0.0.1:3100
echo

echo "[OK] Deploy complete"
echo "      web: http://127.0.0.1:3100"
echo "      api: http://127.0.0.1:5100"
echo "      image_tag: $CURRENT_SHA"
echo "      previous_sha: $PREVIOUS_SHA"
