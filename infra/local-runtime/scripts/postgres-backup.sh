#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/infra/local-runtime"
BACKUP_DIR="$RUNTIME_DIR/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_PATH="$BACKUP_DIR/mission-control-postgres-${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"

cd "$RUNTIME_DIR"

if ! docker compose --env-file .env ps --status running postgres >/dev/null 2>&1; then
  echo "postgres service is not running. Start runtime with ./infra/local-runtime/up.sh" >&2
  exit 1
fi

# Load env values with defaults
set -a
source ./.env
set +a

PGUSER="${MC_POSTGRES_USER:-mission_control}"
PGDB="${MC_POSTGRES_DB:-mission_control}"

docker compose --env-file .env exec -T postgres pg_dump -U "$PGUSER" -d "$PGDB" > "$BACKUP_PATH"

echo "PostgreSQL backup created: $BACKUP_PATH"
