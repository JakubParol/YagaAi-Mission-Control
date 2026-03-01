#!/bin/bash
# Mission Control — deploy after merge to main
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "Switching to main and pulling..."
git checkout main
git pull origin main

# --- API ---
echo "Installing API dependencies..."
cd services/api
poetry install --only main --no-interaction
cd ../..

# --- Web ---
echo "Loading env for build (NEXT_PUBLIC_API_URL)..."
set -a
source /home/kuba/mission-control/mission-control.env
set +a

cd apps/web

echo "Cleaning .next..."
rm -rf .next

echo "Building..."
npm run build

cd ../..

# --- CLI ---
echo "Installing CLI dependencies..."
cd apps/cli
npm ci

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
