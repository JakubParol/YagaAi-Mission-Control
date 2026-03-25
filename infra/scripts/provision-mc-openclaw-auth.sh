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
  local prod_auth_dir="$PROD_ENV_DIR/openclaw-auth"
  local dev_auth_dir="$REPO_ROOT/infra/dev/secrets/openclaw-auth"
  local setup_script="$REPO_ROOT/infra/scripts/setup-openclaw-client-auth.sh"

  echo "[INFO] Provisioning OpenClaw device-auth for Mission Control"

  # PROD auth — dedicated device identity
  # Files are world-readable (0644/0755) because the API container runs
  # as appuser (UID 1001) and the read-only bind mount prevents writes.
  run_as_install_user "bash '$setup_script' --target-dir '$prod_auth_dir'"
  $SUDO chown -R root:root "$prod_auth_dir" 2>/dev/null || true
  $SUDO chmod 755 "$prod_auth_dir"
  $SUDO chmod 644 "$prod_auth_dir"/* 2>/dev/null || true

  # Verify PROD auth is complete
  if [[ ! -f "$prod_auth_dir/device.json" || ! -f "$prod_auth_dir/device-auth.json" ]]; then
    echo "[ERROR] PROD OpenClaw auth provisioning incomplete — aborting" >&2
    exit 1
  fi

  # DEV auth — separate dedicated device identity (not a copy of PROD)
  run_as_install_user "bash '$setup_script' --target-dir '$dev_auth_dir'"
  $SUDO chown -R "$INSTALL_USER:$INSTALL_USER" "$dev_auth_dir" 2>/dev/null || true
  $SUDO chmod 755 "$dev_auth_dir"
  $SUDO chmod 644 "$dev_auth_dir"/* 2>/dev/null || true

  # Verify DEV auth is complete
  if [[ ! -f "$dev_auth_dir/device.json" || ! -f "$dev_auth_dir/device-auth.json" ]]; then
    echo "[ERROR] DEV OpenClaw auth provisioning incomplete — aborting" >&2
    exit 1
  fi

  # Update PROD env to point at the container-internal path
  if ! $SUDO grep -q 'MC_API_OPENCLAW_DEVICE_AUTH_DIR' "$PROD_ENV_FILE" 2>/dev/null; then
    {
      echo ""
      echo "# OpenClaw dispatch (control plane)"
      echo "MC_API_OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789"
      echo "MC_API_OPENCLAW_DEVICE_AUTH_DIR=/run/secrets/openclaw-auth"
    } | $SUDO tee -a "$PROD_ENV_FILE" >/dev/null
    echo "[INFO] Added OpenClaw device-auth config to $PROD_ENV_FILE"
  fi

  # Remove legacy OpenClaw env vars from PROD env if present
  for legacy_var in MC_API_OPENCLAW_GATEWAY_TOKEN MC_API_OPENCLAW_DEVICE_IDENTITY_PATH MC_API_OPENCLAW_DEVICE_AUTH_PATH; do
    if $SUDO grep -q "$legacy_var" "$PROD_ENV_FILE" 2>/dev/null; then
      $SUDO sed -i "/$legacy_var/d" "$PROD_ENV_FILE"
      echo "[INFO] Removed legacy $legacy_var from $PROD_ENV_FILE"
    fi
  done
}
