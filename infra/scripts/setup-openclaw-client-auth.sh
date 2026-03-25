#!/usr/bin/env bash
set -euo pipefail

# -------------------------------------------------------------------
# setup-openclaw-client-auth.sh
#
# Provisions dedicated Mission Control OpenClaw device-auth material
# using the native OpenClaw file model:
#   device.json      — Ed25519 key pair (native format)
#   device-auth.json — device-scoped auth tokens by role (native format)
#
# Key generation uses openssl CLI (no Python packages required).
# Gateway registration is optional and requires python3 + cryptography.
#
# Usage:
#   ./setup-openclaw-client-auth.sh --target-dir <dir>
#
# Environments:
#   PROD:  --target-dir /etc/mission-control/openclaw-auth
#   DEV:   --target-dir ./infra/dev/secrets/openclaw-auth
#   Local: --target-dir ./services/api/.openclaw-auth
# -------------------------------------------------------------------

# Resolve the real user's home even under sudo
_REAL_HOME="${HOME}"
if [[ -n "${SUDO_USER:-}" ]]; then
  _REAL_HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
fi

DEFAULT_OPENCLAW_CONFIG="$_REAL_HOME/.openclaw/openclaw.json"
DEFAULT_GATEWAY_URL="ws://127.0.0.1:18789"

TARGET_DIR=""
GATEWAY_URL=""
GATEWAY_TOKEN=""
SKIP_PAIRING=false
FORCE=false

usage() {
  cat <<'EOF'
Usage: setup-openclaw-client-auth.sh [OPTIONS]

Provision dedicated Mission Control OpenClaw device-auth material.

Options:
  --target-dir <dir>      Output directory for device.json + device-auth.json (required)
  --gateway-url <url>     Gateway WebSocket URL (default: from openclaw.json)
  --gateway-token <tok>   Gateway shared token (default: from openclaw.json)
  --skip-pairing          Generate files without Gateway registration
  --force                 Overwrite existing auth files
  -h, --help              Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-dir)     TARGET_DIR="$2"; shift 2 ;;
    --gateway-url)    GATEWAY_URL="$2"; shift 2 ;;
    --gateway-token)  GATEWAY_TOKEN="$2"; shift 2 ;;
    --skip-pairing)   SKIP_PAIRING=true; shift ;;
    --force)          FORCE=true; shift ;;
    -h|--help)        usage; exit 0 ;;
    *)                echo "[ERROR] Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  echo "[ERROR] --target-dir is required" >&2
  usage
  exit 1
fi

DEVICE_JSON="$TARGET_DIR/device.json"
DEVICE_AUTH_JSON="$TARGET_DIR/device-auth.json"

if [[ -f "$DEVICE_JSON" && -f "$DEVICE_AUTH_JSON" && "$FORCE" != "true" ]]; then
  echo "[INFO] Auth files already exist in $TARGET_DIR"
  echo "[INFO] Use --force to overwrite"
  exit 0
fi

# Resolve gateway config from openclaw.json if not provided
if [[ -z "$GATEWAY_TOKEN" && -f "$DEFAULT_OPENCLAW_CONFIG" ]]; then
  GATEWAY_TOKEN="$(python3 -c "
import json
with open('$DEFAULT_OPENCLAW_CONFIG') as f:
    cfg = json.load(f)
print(cfg.get('gateway', {}).get('auth', {}).get('token', ''))
" 2>/dev/null || true)"
fi

if [[ -z "$GATEWAY_URL" && -f "$DEFAULT_OPENCLAW_CONFIG" ]]; then
  port="$(python3 -c "
import json
with open('$DEFAULT_OPENCLAW_CONFIG') as f:
    cfg = json.load(f)
print(cfg.get('gateway', {}).get('port', 18789))
" 2>/dev/null || echo "18789")"
  GATEWAY_URL="ws://127.0.0.1:$port"
fi
GATEWAY_URL="${GATEWAY_URL:-$DEFAULT_GATEWAY_URL}"

if [[ -z "$GATEWAY_TOKEN" ]]; then
  echo "[ERROR] Gateway token not found. Provide --gateway-token or ensure ~/.openclaw/openclaw.json exists." >&2
  exit 1
fi

# Require openssl for key generation
if ! command -v openssl >/dev/null 2>&1; then
  echo "[ERROR] openssl is required but not found" >&2
  exit 1
fi

echo "[INFO] Generating Mission Control OpenClaw device-auth material"
echo "[INFO] Target directory: $TARGET_DIR"
echo "[INFO] Gateway: $GATEWAY_URL"

# Create target directory, escalating to sudo only if needed
if ! mkdir -p "$TARGET_DIR" 2>/dev/null; then
  sudo mkdir -p "$TARGET_DIR"
  sudo chown "$(id -u):$(id -g)" "$TARGET_DIR"
fi

# --- Step 1: Generate Ed25519 key pair using openssl (no Python packages) ---
TMPKEY="$(mktemp)"
trap 'rm -f "$TMPKEY"' EXIT

openssl genpkey -algorithm Ed25519 -out "$TMPKEY" 2>/dev/null

PRIVATE_PEM="$(cat "$TMPKEY")"
PUBLIC_PEM="$(openssl pkey -in "$TMPKEY" -pubout 2>/dev/null)"

# Device ID = SHA-256 of raw Ed25519 public key bytes (last 32 bytes of DER)
DEVICE_ID="$(openssl pkey -in "$TMPKEY" -pubout -outform DER 2>/dev/null \
  | tail -c 32 \
  | sha256sum \
  | cut -d' ' -f1)"

CREATED_AT_MS="$(python3 -c "import time; print(int(time.time() * 1000))")"

# --- Step 2: Write device.json (native OpenClaw format) ---
python3 - "$DEVICE_JSON" "$DEVICE_ID" "$CREATED_AT_MS" <<PYDEVICE
import json, os, sys
path, device_id, created_ms = sys.argv[1], sys.argv[2], int(sys.argv[3])
private_pem = """$PRIVATE_PEM"""
public_pem = """$PUBLIC_PEM"""
data = {
    "version": 1,
    "deviceId": device_id,
    "publicKeyPem": public_pem,
    "privateKeyPem": private_pem,
    "createdAtMs": created_ms,
}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
os.chmod(path, 0o600)
print(f"[INFO] {path} written")
PYDEVICE

# --- Step 3: Write device-auth.json (native OpenClaw format) ---
python3 - "$DEVICE_AUTH_JSON" "$DEVICE_ID" "$GATEWAY_TOKEN" "$CREATED_AT_MS" <<'PYAUTH'
import json, os, sys
path, device_id, token, created_ms = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
data = {
    "version": 1,
    "deviceId": device_id,
    "tokens": {
        "operator": {
            "token": token,
            "role": "operator",
            "scopes": [
                "operator.read",
                "operator.write",
            ],
            "updatedAtMs": created_ms,
        },
    },
}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
os.chmod(path, 0o600)
print(f"[INFO] {path} written")
PYAUTH

echo "[INFO] Device ID: $DEVICE_ID"

# --- Step 4: Optional Gateway registration (needs cryptography + websockets) ---
if [[ "$SKIP_PAIRING" == "true" ]]; then
  echo "[INFO] Skipping Gateway registration (--skip-pairing)"
  echo "[INFO] Device will need to be approved before dispatch works"
else
  if ! python3 -c "import cryptography, websockets" 2>/dev/null; then
    echo "[WARN] python3 cryptography/websockets not available — skipping Gateway registration"
    echo "[INFO] Install them and re-run, or approve the device manually"
  else
    python3 - "$DEVICE_JSON" "$GATEWAY_TOKEN" "$GATEWAY_URL" <<'PYREGISTER'
import asyncio, base64, json, platform, sys, time, uuid
from cryptography.hazmat.primitives import serialization
import websockets

device_path, gateway_token, ws_url = sys.argv[1], sys.argv[2], sys.argv[3]
PROTOCOL_VERSION, TIMEOUT = 3, 30

with open(device_path) as f:
    dev = json.load(f)
pk = serialization.load_pem_private_key(dev["privateKeyPem"].encode(), password=None)
pub_raw = pk.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
pub_b64 = base64.urlsafe_b64encode(pub_raw).rstrip(b"=").decode()

async def register():
    async with websockets.connect(ws_url, open_timeout=10) as ws:
        challenge = json.loads(await asyncio.wait_for(ws.recv(), timeout=TIMEOUT))
        nonce = challenge["payload"]["nonce"]
        ts = int(time.time() * 1000)
        payload = "|".join([
            "v3", dev["deviceId"], "cli", "cli", "operator",
            "operator.write", str(ts), gateway_token, nonce,
            platform.system().lower(), "",
        ])
        sig = base64.urlsafe_b64encode(pk.sign(payload.encode())).rstrip(b"=").decode()
        msg = {
            "type": "req", "id": str(uuid.uuid4()), "method": "connect",
            "params": {
                "auth": {"token": gateway_token},
                "role": "operator", "scopes": ["operator.write"],
                "client": {"id": "cli", "mode": "cli", "version": "1.0.0",
                           "platform": platform.system().lower()},
                "device": {"id": dev["deviceId"], "publicKey": pub_b64,
                           "signature": sig, "signedAt": ts, "nonce": nonce},
                "minProtocol": PROTOCOL_VERSION, "maxProtocol": PROTOCOL_VERSION,
            },
        }
        await ws.send(json.dumps(msg))
        resp = json.loads(await asyncio.wait_for(ws.recv(), timeout=TIMEOUT))
        if resp.get("ok"):
            print("[OK] Device registered and approved by Gateway")
        else:
            err = resp.get("error", {})
            print(f"[WARN] Gateway: {err.get('code', '?')} — {err.get('message', '?')}")
            print("[INFO] You may need to approve: openclaw devices approve --latest")

try:
    asyncio.run(register())
except Exception as exc:
    print(f"[WARN] Gateway registration failed: {exc}")
    print("[INFO] Start the Gateway and approve the device when ready")
PYREGISTER
  fi
fi

echo ""
echo "[OK] Mission Control OpenClaw device-auth provisioning complete"
echo "     Directory: $TARGET_DIR"
echo "     device.json:      key pair (native OpenClaw format)"
echo "     device-auth.json: auth tokens (native OpenClaw format)"
