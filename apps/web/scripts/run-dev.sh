#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

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
export NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-vscode}"

exec ./node_modules/.bin/next dev --hostname "$DEV_HOST" --port "$DEV_PORT" "$@"
