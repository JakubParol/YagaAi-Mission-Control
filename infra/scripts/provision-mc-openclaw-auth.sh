#!/usr/bin/env bash
set -euo pipefail

# -------------------------------------------------------------------
# provision-mc-openclaw-auth.sh
#
# Called by install.sh to provision MC device-auth for PROD + DEV and
# update the PROD env file. Inherits REPO_ROOT, PROD_ENV_DIR,
# PROD_ENV_FILE, INSTALL_USER, SUDO, and run_as_install_user from
# the calling shell.
# -------------------------------------------------------------------

provision_openclaw_auth() {
  local prod_auth_path="$PROD_ENV_DIR/openclaw-device-auth.json"
  local dev_auth_path="$REPO_ROOT/infra/dev/secrets/openclaw-device-auth.json"
  local setup_script="$REPO_ROOT/infra/scripts/setup-openclaw-client-auth.sh"

  echo "[INFO] Provisioning OpenClaw device-auth for Mission Control"

  # PROD auth file
  run_as_install_user "bash '$setup_script' --target '$prod_auth_path'"
  $SUDO chown root:root "$prod_auth_path" 2>/dev/null || true
  $SUDO chmod 600 "$prod_auth_path"

  # DEV auth file (copy from PROD — same host, same gateway)
  if [[ ! -f "$dev_auth_path" ]]; then
    mkdir -p "$(dirname "$dev_auth_path")"
    $SUDO cp "$prod_auth_path" "$dev_auth_path"
    $SUDO chown "$INSTALL_USER:$INSTALL_USER" "$dev_auth_path" 2>/dev/null || true
    $SUDO chmod 600 "$dev_auth_path"
    echo "[INFO] Copied PROD auth to DEV: $dev_auth_path"
  fi

  # Update PROD env to point at the container-internal path
  if ! $SUDO grep -q 'MC_API_OPENCLAW_DEVICE_AUTH_PATH' "$PROD_ENV_FILE" 2>/dev/null; then
    {
      echo ""
      echo "# OpenClaw dispatch (control plane)"
      echo "MC_API_OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789"
      echo "MC_API_OPENCLAW_DEVICE_AUTH_PATH=/run/secrets/openclaw-device-auth.json"
    } | $SUDO tee -a "$PROD_ENV_FILE" >/dev/null
    echo "[INFO] Added OpenClaw device-auth config to $PROD_ENV_FILE"
  fi

  # Remove legacy OpenClaw env vars from PROD env if present
  if $SUDO grep -q 'MC_API_OPENCLAW_GATEWAY_TOKEN' "$PROD_ENV_FILE" 2>/dev/null; then
    $SUDO sed -i '/MC_API_OPENCLAW_GATEWAY_TOKEN/d' "$PROD_ENV_FILE"
    echo "[INFO] Removed legacy MC_API_OPENCLAW_GATEWAY_TOKEN from $PROD_ENV_FILE"
  fi
  if $SUDO grep -q 'MC_API_OPENCLAW_DEVICE_IDENTITY_PATH' "$PROD_ENV_FILE" 2>/dev/null; then
    $SUDO sed -i '/MC_API_OPENCLAW_DEVICE_IDENTITY_PATH/d' "$PROD_ENV_FILE"
    echo "[INFO] Removed legacy MC_API_OPENCLAW_DEVICE_IDENTITY_PATH from $PROD_ENV_FILE"
  fi
}
