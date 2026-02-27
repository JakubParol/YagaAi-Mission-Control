#!/bin/bash
# Mission Control — deploy after merge to main
set -e

cd "$(dirname "$0")/.."

echo "📦 Switching to main and pulling..."
git checkout main
git pull origin main

cd apps/web

echo "🧹 Cleaning .next..."
rm -rf .next

echo "🔨 Building..."
npm run build

echo "⏳ Waiting for build artifacts..."
test -f .next/server/pages-manifest.json

echo "🔄 Restarting service..."
sudo systemctl restart mission-control

echo "✅ Deployed! Check: http://localhost:3100"
