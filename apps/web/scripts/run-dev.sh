#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

lock_in_use() {
  lock_file="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof "$lock_file" >/dev/null 2>&1
    return
  fi

  if command -v fuser >/dev/null 2>&1; then
    fuser "$lock_file" >/dev/null 2>&1
    return
  fi

  return 1
}

cleanup_stale_lock() {
  lock_file="$1"

  if [ ! -e "$lock_file" ]; then
    return 0
  fi

  if lock_in_use "$lock_file"; then
    return 0
  fi

  echo "Removing stale Next.js dev lock: $lock_file"
  rm -f "$lock_file"
}

if [ -n "${MC_WEB_HOST:-}" ]; then
  DEV_HOST="$MC_WEB_HOST"
elif command -v tailscale >/dev/null 2>&1; then
  TAILSCALE_IP="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
  DEV_HOST="${TAILSCALE_IP:-0.0.0.0}"
else
  DEV_HOST="0.0.0.0"
fi

DEV_PORT="${PORT:-3001}"
export API_URL="${API_URL:-http://127.0.0.1:5001}"
export NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-local}"

cleanup_stale_lock "$NEXT_DIST_DIR/dev/lock"

exec ./node_modules/.bin/next dev --hostname "$DEV_HOST" --port "$DEV_PORT" "$@"
