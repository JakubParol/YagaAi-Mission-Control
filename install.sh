#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
INSTALL_USER="${SUDO_USER:-${USER:-}}"
DEV_ENV_FILE="$REPO_ROOT/infra/dev/.env"
PROD_ENV_DIR="/etc/mission-control"
PROD_ENV_FILE="$PROD_ENV_DIR/prod.env"
MC_WRAPPER_PATH="/usr/local/bin/mc"
MC_DEV_WRAPPER_PATH="/usr/local/bin/mc-dev"
MC_PROD_WRAPPER_PATH="/usr/local/bin/mc-prod"
DEV_SERVICE_NAME="mission-control-dev.service"
PROD_SERVICE_NAME="mission-control-prod.service"

if [[ -z "$INSTALL_USER" ]]; then
  echo "[ERROR] Unable to resolve install user" >&2
  exit 1
fi

if [[ ! -f "$REPO_ROOT/AGENTS.md" ]]; then
  echo "[ERROR] install.sh must be run from the repository root" >&2
  exit 1
fi

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

APT_UPDATED=0

run_as_install_user() {
  local cmd="$1"
  if [[ "${EUID}" -eq 0 && "$INSTALL_USER" != "root" ]]; then
    sudo -u "$INSTALL_USER" -H bash -lc "$cmd"
  else
    bash -lc "$cmd"
  fi
}

apt_update_once() {
  if [[ "$APT_UPDATED" -eq 0 ]]; then
    $SUDO apt-get update
    APT_UPDATED=1
  fi
}

install_apt_packages() {
  apt_update_once
  $SUDO apt-get install -y "$@"
}

require_ubuntu() {
  if [[ ! -f /etc/os-release ]]; then
    echo "[ERROR] /etc/os-release not found" >&2
    exit 1
  fi

  # shellcheck disable=SC1091
  source /etc/os-release
  if [[ "${ID:-}" != "ubuntu" ]]; then
    echo "[ERROR] This installer targets Ubuntu. Detected: ${ID:-unknown}" >&2
    exit 1
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "[INFO] Docker + Compose already installed"
  else
    echo "[INFO] Installing Docker runtime"
    install_apt_packages ca-certificates curl gnupg
    if ! install_apt_packages docker.io docker-compose-v2; then
      install_apt_packages docker.io docker-compose-plugin
    fi
  fi

  $SUDO systemctl enable --now docker
  if getent group docker >/dev/null 2>&1; then
    $SUDO usermod -aG docker "$INSTALL_USER" || true
  fi
}

node_major_version() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "0"
}

install_nodejs() {
  local major
  major="$(node_major_version)"
  if command -v node >/dev/null 2>&1 && [[ "$major" -ge 20 ]]; then
    echo "[INFO] Node.js $major already installed"
    return
  fi

  echo "[INFO] Installing Node.js 22.x"
  install_apt_packages ca-certificates curl
  if [[ "${EUID}" -eq 0 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  else
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  fi
  APT_UPDATED=0
  install_apt_packages nodejs
}

bootstrap_env_files() {
  if [[ ! -f "$DEV_ENV_FILE" ]]; then
    cp "$REPO_ROOT/infra/dev/.env.example" "$DEV_ENV_FILE"
    echo "[INFO] Created $DEV_ENV_FILE"
  fi

  $SUDO mkdir -p "$PROD_ENV_DIR"
  if [[ ! -f "$PROD_ENV_FILE" ]]; then
    local prod_password
    prod_password="$(
      python3 - <<'PY'
import secrets
print(secrets.token_hex(16))
PY
    )"
    sed "s/change_me/${prod_password}/g" "$REPO_ROOT/infra/env/prod.env.example" | $SUDO tee "$PROD_ENV_FILE" >/dev/null
    echo "[INFO] Created $PROD_ENV_FILE with generated PostgreSQL password"
  else
    echo "[INFO] Reusing existing $PROD_ENV_FILE"
  fi

  if $SUDO grep -q '^MC_API_POSTGRES_DSN=postgresql://' "$PROD_ENV_FILE"; then
    $SUDO sed -i 's#^MC_API_POSTGRES_DSN=postgresql://#MC_API_POSTGRES_DSN=postgresql+psycopg://#' "$PROD_ENV_FILE"
    echo "[INFO] Migrated MC_API_POSTGRES_DSN in $PROD_ENV_FILE to postgresql+psycopg://"
  fi
}

build_global_cli() {
  echo "[INFO] Installing CLI dependencies"
  run_as_install_user "cd '$REPO_ROOT/apps/cli' && npm ci && npm run build"

  local cli_entry="$REPO_ROOT/apps/cli/dist/index.js"

  echo "[INFO] Installing mc wrappers: $MC_WRAPPER_PATH, $MC_DEV_WRAPPER_PATH, $MC_PROD_WRAPPER_PATH"

  # Bare mc — no default API target; write operations fail unless explicit
  $SUDO tee "$MC_WRAPPER_PATH" >/dev/null <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec node "$cli_entry" "\$@"
EOF
  $SUDO chmod 755 "$MC_WRAPPER_PATH"

  # mc-dev — always targets DEV API
  $SUDO tee "$MC_DEV_WRAPPER_PATH" >/dev/null <<EOF
#!/usr/bin/env bash
set -euo pipefail
export MC_API_BASE_URL="http://127.0.0.1:5000"
exec node "$cli_entry" "\$@"
EOF
  $SUDO chmod 755 "$MC_DEV_WRAPPER_PATH"

  # mc-prod — always targets PROD API
  $SUDO tee "$MC_PROD_WRAPPER_PATH" >/dev/null <<EOF
#!/usr/bin/env bash
set -euo pipefail
export MC_API_BASE_URL="http://127.0.0.1:5100"
exec node "$cli_entry" "\$@"
EOF
  $SUDO chmod 755 "$MC_PROD_WRAPPER_PATH"
}

write_dev_service() {
  local target="/etc/systemd/system/$DEV_SERVICE_NAME"
  $SUDO tee "$target" >/dev/null <<EOF
[Unit]
Description=Mission Control DEV (Docker Compose)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target
ConditionPathExists=$REPO_ROOT/infra/dev/docker-compose.yml

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$REPO_ROOT/infra/dev
ExecStartPre=/usr/bin/bash -lc 'test -f $DEV_ENV_FILE || cp $REPO_ROOT/infra/dev/.env.example $DEV_ENV_FILE'
ExecStartPre=/usr/bin/bash -lc '/usr/bin/bash $REPO_ROOT/infra/scripts/run-api-migrations.sh $REPO_ROOT/infra/dev/docker-compose.yml $DEV_ENV_FILE'
ExecStart=/usr/bin/docker compose -f $REPO_ROOT/infra/dev/docker-compose.yml --env-file $DEV_ENV_FILE up -d --remove-orphans --wait
ExecStop=/usr/bin/docker compose -f $REPO_ROOT/infra/dev/docker-compose.yml --env-file $DEV_ENV_FILE down --remove-orphans
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
}

write_prod_service() {
  local target="/etc/systemd/system/$PROD_SERVICE_NAME"
  $SUDO tee "$target" >/dev/null <<EOF
[Unit]
Description=Mission Control PROD (Docker Compose)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$REPO_ROOT
EnvironmentFile=$PROD_ENV_FILE
ExecStartPre=/usr/bin/bash -lc '/usr/bin/bash $REPO_ROOT/infra/scripts/run-api-migrations.sh $REPO_ROOT/infra/prod/docker-compose.prod.yml $PROD_ENV_FILE'
ExecStart=/usr/bin/docker compose -f $REPO_ROOT/infra/prod/docker-compose.prod.yml --env-file $PROD_ENV_FILE up -d --remove-orphans --wait
ExecStop=/usr/bin/docker compose -f $REPO_ROOT/infra/prod/docker-compose.prod.yml --env-file $PROD_ENV_FILE down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
}

install_systemd_units() {
  echo "[INFO] Installing systemd units"
  write_dev_service
  write_prod_service
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable "$DEV_SERVICE_NAME" "$PROD_SERVICE_NAME"
}

initial_bringup() {
  echo "[INFO] Building and starting DEV stack"
  $SUDO bash "$REPO_ROOT/infra/dev/rebuild-all.sh"

  echo "[INFO] Building and starting PROD stack"
  $SUDO bash "$REPO_ROOT/infra/deploy.sh"

  echo "[INFO] Registering running stacks under systemd"
  $SUDO systemctl start "$DEV_SERVICE_NAME"
  $SUDO systemctl start "$PROD_SERVICE_NAME"
}

print_summary() {
  cat <<EOF

[OK] Mission Control bootstrap complete

- DEV env: $DEV_ENV_FILE
- PROD env: $PROD_ENV_FILE
- CLI wrappers: $MC_WRAPPER_PATH, $MC_DEV_WRAPPER_PATH, $MC_PROD_WRAPPER_PATH
- DEV service: $DEV_SERVICE_NAME
- PROD service: $PROD_SERVICE_NAME

Execution profiles:
  mc-dev   → always targets DEV  API (http://127.0.0.1:5000)
  mc-prod  → always targets PROD API (http://127.0.0.1:5100)
  mc       → read-only unless MC_API_BASE_URL or --api-base is set

Examples:
  mc-dev health
  mc-prod project list
  mc --api-base http://127.0.0.1:5000 health

Recommended next step:
- Review $PROD_ENV_FILE and adjust secrets/integration settings if needed

Note:
- Docker group membership was updated for $INSTALL_USER. A fresh login may be needed
  before running docker commands without sudo in an interactive shell.
EOF
}

require_ubuntu
install_docker
install_nodejs
bootstrap_env_files
build_global_cli
install_systemd_units
initial_bringup
print_summary
