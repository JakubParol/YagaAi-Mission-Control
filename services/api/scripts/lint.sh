#!/usr/bin/env bash
#
# Runs all code quality tools for Mission Control API.
#
# Usage:
#   ./scripts/lint.sh           # Check mode (no changes)
#   ./scripts/lint.sh --fix     # Fix mode (format + sort) then run all checks
#   ./scripts/lint.sh --skip-tests  # Skip tests directory in pylint
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$API_ROOT"

FIX=false
SKIP_TESTS=false
for arg in "$@"; do
    case "$arg" in
        --fix) FIX=true ;;
        --skip-tests) SKIP_TESTS=true ;;
    esac
done

# Ensure poetry is available
if ! command -v poetry &>/dev/null; then
    echo "Poetry not found. Install: https://python-poetry.org/docs/#installation"
    exit 1
fi

PYLINT_TARGETS="app"
if [[ "$SKIP_TESTS" == false ]]; then
    PYLINT_TARGETS="app tests"
fi

declare -A RESULTS
FAILED=0

run_tool() {
    local name="$1"
    shift
    echo ""
    echo "› $name"
    if poetry run "$@"; then
        RESULTS["$name"]="OK"
        echo "$name: OK"
    else
        local code=$?
        RESULTS["$name"]="FAILED ($code)"
        echo "$name: FAILED ($code)"
        FAILED=1
    fi
}

run_pylint() {
    echo ""
    echo "› Pylint"
    set +e
    poetry run pylint --rcfile pyproject.toml $PYLINT_TARGETS
    local code=$?
    set -e

    local has_fatal=$(( code & 1 ))
    local has_error=$(( code & 2 ))
    local has_usage=$(( code & 32 ))

    if (( has_fatal || has_error || has_usage )); then
        RESULTS["Pylint"]="FAILED ($code)"
        echo "Pylint: FAILED ($code)"
        FAILED=1
    elif (( code != 0 )); then
        RESULTS["Pylint"]="WARNINGS"
        echo "Pylint: WARNINGS (non-blocking)"
    else
        RESULTS["Pylint"]="OK"
        echo "Pylint: OK"
    fi
}

# --- Black & isort ---
if [[ "$FIX" == true ]]; then
    run_tool "Black (fix)" black .
    run_tool "isort (fix)" isort .
else
    run_tool "Black (check)" black --check --diff .
    run_tool "isort (check)" isort --check-only --diff .
fi

# --- Pylint ---
run_pylint

# --- Import Linter ---
run_tool "Import Linter" lint-imports

# --- Pyright ---
run_tool "Pyright" pyright

# --- Bandit ---
run_tool "Bandit" bandit -r app -ll -q

# --- Post-fix re-check ---
if [[ "$FIX" == true ]]; then
    echo ""
    echo "› Post-fix checks"
    poetry run black --check --diff . || true
    poetry run isort --check-only --diff . || true
fi

# --- Summary ---
echo ""
echo "=== Summary ==="
for tool in "${!RESULTS[@]}"; do
    status="${RESULTS[$tool]}"
    echo "  $tool: $status"
done

if (( FAILED )); then
    echo ""
    echo "FAILED. Fix errors above."
    exit 1
else
    echo ""
    echo "ALL PASSED."
    exit 0
fi
