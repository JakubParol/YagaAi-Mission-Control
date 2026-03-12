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

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/infra/dev"

cd "$RUNTIME_DIR"

if ! docker compose --env-file .env ps --status running postgres >/dev/null 2>&1; then
  echo "postgres service is not running. Start runtime with ./infra/dev/up.sh" >&2
  exit 1
fi

set -a
source ./.env
set +a

PGUSER="${MC_POSTGRES_USER:-mission_control}"
PGDB="${MC_POSTGRES_DB:-mission_control}"

# Backup dumps are created with --clean/--if-exists so restore can be rerun safely.
docker compose --env-file .env exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d "$PGDB" < "$BACKUP_FILE"

echo "PostgreSQL restore completed from: $BACKUP_FILE"
