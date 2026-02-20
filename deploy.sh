#!/bin/bash
# Mission Control — deploy after merge to main
set -e

cd "$(dirname "$0")"

echo "📦 Pulling latest..."
git pull origin main

echo "🔨 Building..."
npm run build

echo "🔄 Restarting service..."
sudo systemctl restart mission-control

echo "✅ Deployed! Check: http://localhost:3100"
