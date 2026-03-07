#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/infra/local-runtime"
BACKUP_DIR="$RUNTIME_DIR/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_PATH="${1:-$BACKUP_DIR/mission-control-$TIMESTAMP.db}"

mkdir -p "$BACKUP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

if ! docker compose -f "$RUNTIME_DIR/docker-compose.yml" ps --status running sqlite >/dev/null 2>&1; then
  echo "sqlite service is not running. Start runtime with ./infra/local-runtime/up.sh" >&2
  exit 1
fi

TMP_DEST="/data/backup-${TIMESTAMP}.db"

docker compose -f "$RUNTIME_DIR/docker-compose.yml" exec -T sqlite sh -lc "sqlite3 /data/mission-control.db '.backup $TMP_DEST' && sqlite3 $TMP_DEST 'PRAGMA quick_check;'"
docker compose -f "$RUNTIME_DIR/docker-compose.yml" cp "sqlite:$TMP_DEST" "$BACKUP_PATH"
docker compose -f "$RUNTIME_DIR/docker-compose.yml" exec -T sqlite sh -lc "rm -f $TMP_DEST"

echo "Backup created: $BACKUP_PATH"
