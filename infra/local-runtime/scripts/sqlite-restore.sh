#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file.db>" >&2
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/infra/local-runtime"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

docker compose -f "$RUNTIME_DIR/docker-compose.yml" stop api web worker dapr-api dapr-web dapr-worker >/dev/null 2>&1 || true

docker compose -f "$RUNTIME_DIR/docker-compose.yml" cp "$BACKUP_FILE" "sqlite:/data/mission-control.db"
docker compose -f "$RUNTIME_DIR/docker-compose.yml" exec -T sqlite sh -lc "CHECK_RESULT=\$(sqlite3 /data/mission-control.db 'PRAGMA quick_check;'); [ \"\$CHECK_RESULT\" = \"ok\" ]"

docker compose -f "$RUNTIME_DIR/docker-compose.yml" up -d api web worker dapr-api dapr-web dapr-worker --wait

echo "Restore completed from: $BACKUP_FILE"
