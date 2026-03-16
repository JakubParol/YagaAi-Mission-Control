#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "[INFO] Mission Control local dev alongside always-on containerized dev/prod"
echo "[INFO] Containerized DEV stays on 3000/5000"
echo "[INFO] Local VS Code dev uses 3001/5001"
echo

echo "Start API in one terminal:"
echo "  cd $ROOT_DIR/services/api && ./scripts/run-dev.sh"
echo

echo "Start WEB in second terminal:"
echo "  cd $ROOT_DIR/apps/web && ./scripts/run-dev.sh"
echo

echo "Expected local ports:"
echo "  API: http://127.0.0.1:5001"
echo "  WEB: http://127.0.0.1:3001"
echo

echo "Containerized always-on ports remain:"
echo "  DEV web:  http://127.0.0.1:3000"
echo "  DEV api:  http://127.0.0.1:5000"
echo "  PROD web: http://127.0.0.1:3100"
echo "  PROD api: http://127.0.0.1:5100"
