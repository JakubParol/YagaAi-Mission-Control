#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

if [[ ! -x ".venv/bin/python" ]]; then
  echo "[ERROR] Missing local virtualenv at $APP_DIR/.venv" >&2
  echo "Create it with:" >&2
  echo "  cd $APP_DIR && python3 -m venv .venv && .venv/bin/pip install -r requirements-prod.txt" >&2
  exit 1
fi

export MC_API_ENV="${MC_API_ENV:-dev}"
export MC_API_HOST="${MC_API_HOST:-0.0.0.0}"
export MC_API_PORT="${MC_API_PORT:-5001}"

exec .venv/bin/python -m uvicorn app.main:app --reload --host "$MC_API_HOST" --port "$MC_API_PORT"
