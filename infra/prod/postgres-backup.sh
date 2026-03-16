#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/infra/prod"
ENV_FILE="/etc/mission-control/prod.env"
BACKUP_DIR="$RUNTIME_DIR/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_PATH="$BACKUP_DIR/mission-control-prod-postgres-${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"

cd "$ROOT_DIR"

if ! docker compose -f "$RUNTIME_DIR/docker-compose.prod.yml" --env-file "$ENV_FILE" ps --status running postgres >/dev/null 2>&1; then
  echo "postgres service is not running. Start prod runtime first." >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

PGUSER="${MC_POSTGRES_USER:-mission_control}"
PGDB="${MC_POSTGRES_DB:-mission_control}"

docker compose -f "$RUNTIME_DIR/docker-compose.prod.yml" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump --clean --if-exists --no-owner --no-privileges -U "$PGUSER" -d "$PGDB" > "$BACKUP_PATH"

echo "PostgreSQL prod backup created: $BACKUP_PATH"
