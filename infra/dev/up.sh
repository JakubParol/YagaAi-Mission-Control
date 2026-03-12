#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/infra/dev"
EXPECTED_DAPR_COMPONENTS=("local-pubsub" "local-statestore" "local-secretstore")

if [ ! -f "$RUNTIME_DIR/.env" ]; then
  cp "$RUNTIME_DIR/.env.example" "$RUNTIME_DIR/.env"
  echo "Created infra/dev/.env from template"
fi

cd "$RUNTIME_DIR"
docker compose --env-file .env up -d --wait

dump_dapr_diagnostics() {
  docker compose --env-file .env logs dapr-placement dapr-api dapr-web dapr-worker --tail=200 || true
}

check_dapr_components_in_python_service() {
  local service="$1"
  local port="$2"
  docker compose --env-file .env exec -T "$service" python - "$port" "${EXPECTED_DAPR_COMPONENTS[@]}" <<'PY'
import json
import sys
import urllib.request

port = sys.argv[1]
expected = set(sys.argv[2:])
with urllib.request.urlopen(f"http://127.0.0.1:{port}/v1.0/metadata", timeout=8) as response:
    payload = json.load(response)
components = {item.get("name") for item in payload.get("components", []) if item.get("name")}
missing = sorted(expected - components)
if missing:
    raise SystemExit(f"Dapr metadata missing components: {', '.join(missing)}")
print(f"Dapr metadata check passed on port {port}: {sorted(components)}")
PY
}

check_dapr_components_in_web_service() {
  local port="$1"
  local expected_csv
  expected_csv="$(IFS=,; echo "${EXPECTED_DAPR_COMPONENTS[*]}")"
  docker compose --env-file .env exec -T web node -e "
const expected = process.argv[1].split(',').filter(Boolean);
fetch('http://127.0.0.1:${port}/v1.0/metadata')
  .then((response) => {
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    return response.json();
  })
  .then((payload) => {
    const components = new Set((payload.components ?? []).map((x) => x.name).filter(Boolean));
    const missing = expected.filter((name) => !components.has(name));
    if (missing.length) {
      throw new Error('Dapr metadata missing components: ' + missing.join(', '));
    }
    console.log('Dapr metadata check passed on web sidecar: ' + Array.from(components).sort().join(', '));
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
" "$expected_csv"
}

echo "Verifying Dapr component bootstrapping..."
if ! check_dapr_components_in_python_service api 3500; then
  dump_dapr_diagnostics
  exit 1
fi
if ! check_dapr_components_in_web_service 3510; then
  dump_dapr_diagnostics
  exit 1
fi
if ! check_dapr_components_in_python_service worker 3520; then
  dump_dapr_diagnostics
  exit 1
fi

echo "Local runtime is up"
docker compose ps
