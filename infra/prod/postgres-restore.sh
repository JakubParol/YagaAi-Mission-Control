#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <backup.sql>" >&2
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/infra/prod"
ENV_FILE="/etc/mission-control/prod.env"

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

# Backup dumps are created with --clean/--if-exists so restore can be rerun safely.
docker compose -f "$RUNTIME_DIR/docker-compose.prod.yml" --env-file "$ENV_FILE" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d "$PGDB" < "$BACKUP_FILE"

echo "PostgreSQL prod restore completed from: $BACKUP_FILE"
