#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <compose-file> <env-file>" >&2
  exit 1
fi

COMPOSE_FILE="$1"
ENV_FILE="$2"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[ERROR] Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[ERROR] Missing env file: $ENV_FILE" >&2
  exit 1
fi

echo "[INFO] Ensuring postgres is up before migrations..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres --wait

echo "[INFO] Running API database migrations..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm --no-deps api \
  alembic upgrade head

echo "[INFO] API migrations completed"
