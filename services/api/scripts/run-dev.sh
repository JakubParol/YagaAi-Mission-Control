#!/usr/bin/env bash
set -euo pipefail

cd /home/kuba/repos/mission-control/services/api
MC_API_ENV=dev poetry run uvicorn app.main:app --reload --port 5000
