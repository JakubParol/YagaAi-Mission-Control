#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

export MC_API_ENV="${MC_API_ENV:-dev}"
export MC_API_HOST="${MC_API_HOST:-0.0.0.0}"
export MC_API_PORT="${MC_API_PORT:-5001}"

exec poetry run uvicorn app.main:app --reload --host "$MC_API_HOST" --port "$MC_API_PORT"
