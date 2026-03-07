#!/usr/bin/env bash
# Mission Control — deploy after merge to main
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "Switching to main and pulling..."
git checkout main
git pull origin main

# --- API ---
echo "Installing API dependencies..."
cd services/api

# Heal stale/broken virtualenvs (e.g. python symlink points to removed interpreter)
if [ -d ".venv" ]; then
  if [ ! -x ".venv/bin/python" ] || ! .venv/bin/python -V >/dev/null 2>&1; then
    BROKEN_SUFFIX="$(date +%Y%m%d%H%M%S)"
    echo "Detected broken API virtualenv; rotating .venv -> .venv.broken.${BROKEN_SUFFIX}"
    mv .venv ".venv.broken.${BROKEN_SUFFIX}" || rm -rf .venv
  fi
fi

poetry install --only main --no-interaction
cd ../..

# --- Web ---
echo "Loading env for build (NEXT_PUBLIC_API_URL)..."
set -a
source /home/kuba/mission-control/mission-control.env
set +a

cd apps/web

echo "Cleaning .next..."
if ! rm -rf .next 2>/dev/null; then
  echo "Standard cleanup failed (likely root-owned artifacts); retrying with sudo..."
  sudo rm -rf .next
fi

echo "Building..."
npm run build

cd ../..

# --- CLI ---
echo "Installing CLI dependencies..."
cd apps/cli
npm ci --include=dev

echo "Building CLI..."
npm run build
cd ../..

echo "Installing global mc command..."
sudo tee /usr/local/bin/mc >/dev/null <<EOF
#!/usr/bin/env bash
exec node "$REPO_ROOT/apps/cli/dist/index.js" "\$@"
EOF
sudo chmod 755 /usr/local/bin/mc

# --- Services ---
echo "Restarting services..."
sudo systemctl restart mission-control-api
sudo systemctl restart mission-control

echo "Deployed! Web: http://localhost:3100 | API: http://localhost:5001"
