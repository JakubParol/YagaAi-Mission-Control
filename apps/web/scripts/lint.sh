#!/usr/bin/env bash
#
# Runs all code quality tools for Mission Control Web.
#
# Usage:
#   ./scripts/lint.sh           # Check mode
#   ./scripts/lint.sh --fix     # Fix mode (eslint --fix)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$WEB_ROOT"

FIX=false
for arg in "$@"; do
    case "$arg" in
        --fix) FIX=true ;;
    esac
done

# Ensure node_modules exist
if [[ ! -d "node_modules" ]]; then
    echo "node_modules not found. Run: npm install"
    exit 1
fi

FAILED=0

run_tool() {
    local name="$1"
    shift
    echo ""
    echo "› $name"
    if "$@"; then
        echo "$name: OK"
    else
        local code=$?
        echo "$name: FAILED ($code)"
        FAILED=1
    fi
}

# --- ESLint ---
if [[ "$FIX" == true ]]; then
    run_tool "ESLint (fix)" npx eslint --fix
else
    run_tool "ESLint (check)" npx eslint
fi

# --- TypeScript ---
run_tool "TypeCheck" npx tsc --noEmit

# --- Summary ---
echo ""
echo "=== Summary ==="
if (( FAILED )); then
    echo "FAILED. Fix errors above."
    exit 1
else
    echo "ALL PASSED."
    exit 0
fi
