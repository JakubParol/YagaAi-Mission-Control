#!/usr/bin/env bash
#
# Fix root-owned files left by DEV containers.
#
# Uses Docker to chown files back to the host user — no sudo required.
# Safe to run at any time; skips paths that have no root-owned files.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

HOST_UID="$(id -u)"
HOST_GID="$(id -g)"

fix_path() {
  local target="$1"
  local label="$2"

  if [ ! -e "$target" ]; then
    return
  fi

  local count
  count="$(find "$target" -user root 2>/dev/null | head -1 | wc -l)"
  if [ "$count" -eq 0 ]; then
    echo "  $label: OK (no root-owned files)"
    return
  fi

  echo "  $label: fixing ownership → ${HOST_UID}:${HOST_GID}"
  docker run --rm -v "$target:/target" alpine chown -R "${HOST_UID}:${HOST_GID}" /target
  echo "  $label: done"
}

echo "Scanning for root-owned files..."
fix_path "$REPO_ROOT/apps/web/node_modules"  "web/node_modules"
fix_path "$REPO_ROOT/apps/web/.next"          "web/.next"
fix_path "$REPO_ROOT/apps/web/.next-local"    "web/.next-local"
fix_path "$REPO_ROOT/apps/web/.next-vscode"   "web/.next-vscode"
fix_path "$REPO_ROOT/apps/cli/node_modules"   "cli/node_modules"
echo "Done."
