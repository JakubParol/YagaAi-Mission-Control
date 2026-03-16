#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
WEB_ROOT="$(dirname -- "$SCRIPT_DIR")"
cd "$WEB_ROOT"

PORT="${1:-${PORT:-3001}}"
NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-local}"
LOCK_FILE="$NEXT_DIST_DIR/dev/lock"

find_listener_pids() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | sort -u
        return
    fi

    if command -v fuser >/dev/null 2>&1; then
        fuser -n tcp "$PORT" 2>/dev/null | tr ' ' '\n' | awk 'NF' | sort -u
        return
    fi

    echo "Missing required tool: install lsof or fuser to inspect port $PORT." >&2
    exit 1
}

lock_in_use() {
    local lock_file="$1"

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
    local lock_file="$1"

    [[ -e "$lock_file" ]] || return 0

    if lock_in_use "$lock_file"; then
        echo "Next.js lock is still active: $lock_file"
        return 0
    fi

    echo "Removing stale Next.js lock: $lock_file"
    rm -f "$lock_file"
}

mapfile -t PIDS < <(find_listener_pids)

if (( ${#PIDS[@]} == 0 )); then
    echo "Nothing is listening on port $PORT."
    cleanup_stale_lock "$LOCK_FILE"
    exit 0
fi

echo "Stopping processes listening on port $PORT: ${PIDS[*]}"
kill "${PIDS[@]}"

for _ in {1..20}; do
    sleep 0.25
    mapfile -t REMAINING < <(find_listener_pids)
    if (( ${#REMAINING[@]} == 0 )); then
        echo "Port $PORT is now free."
        cleanup_stale_lock "$LOCK_FILE"
        exit 0
    fi
done

echo "Processes still alive after graceful stop; sending SIGKILL: ${REMAINING[*]}"
kill -9 "${REMAINING[@]}"

echo "Port $PORT is now free."
cleanup_stale_lock "$LOCK_FILE"
