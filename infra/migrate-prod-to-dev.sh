#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <prod-backup.sql>" >&2
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[INFO] Stopping PROD app services before restore..."
docker compose -f infra/prod/docker-compose.prod.yml --env-file /etc/mission-control/prod.env stop api web worker dapr-api dapr-web dapr-worker

echo "[INFO] Restoring dump into PROD PostgreSQL..."
./infra/prod/postgres-restore.sh "$BACKUP_FILE"

echo "[INFO] Running PROD deploy (migrations + stack bring-up)..."
./infra/deploy.sh prod

echo "[INFO] Refreshing DEV PostgreSQL from the same dump..."
./infra/dev/scripts/postgres-restore.sh "$BACKUP_FILE"

echo "[OK] Migration flow complete"
echo "     PROD restored from: $BACKUP_FILE"
echo "     DEV refreshed from: $BACKUP_FILE"
