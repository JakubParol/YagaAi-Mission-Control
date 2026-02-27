#!/bin/bash
# Mission Control — deploy after merge to main
set -e

cd "$(dirname "$0")/.."

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

# --- Services ---
echo "Restarting services..."
sudo systemctl restart mission-control-api
sudo systemctl restart mission-control

echo "Deployed! Web: http://localhost:3100 | API: http://localhost:5001"
