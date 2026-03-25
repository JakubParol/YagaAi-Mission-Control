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

echo "[INFO] Device ID: $DEVICE_ID"

# --- Step 3: Register with Gateway and obtain device-scoped token ---
#
# The Gateway issues a real device-scoped token (payload.auth.deviceToken)
# on successful connect. This token is written into device-auth.json in
# native OpenClaw format. The shared gateway token is used only for the
# initial pairing handshake and is NOT persisted.

if [[ "$SKIP_PAIRING" == "true" ]]; then
  echo "[WARN] Skipping Gateway registration (--skip-pairing)"
  echo "[WARN] device-auth.json was NOT written — dispatch will not work"
  echo "[INFO] Run without --skip-pairing when the Gateway is available"
elif ! python3 -c "import cryptography, websockets" 2>/dev/null; then
  echo "[ERROR] python3 cryptography/websockets are required for Gateway registration" >&2
  echo "[ERROR] Install: pip install cryptography websockets" >&2
  exit 1
else
  python3 - "$DEVICE_JSON" "$DEVICE_AUTH_JSON" "$GATEWAY_TOKEN" "$GATEWAY_URL" <<'PYREGISTER'
import asyncio, base64, json, os, platform, sys, time, uuid
from cryptography.hazmat.primitives import serialization
import websockets

device_path, auth_path, gateway_token, ws_url = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
PROTOCOL_VERSION, TIMEOUT = 3, 30

with open(device_path) as f:
    dev = json.load(f)
pk = serialization.load_pem_private_key(dev["privateKeyPem"].encode(), password=None)
pub_raw = pk.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
pub_b64 = base64.urlsafe_b64encode(pub_raw).rstrip(b"=").decode()

async def register_and_persist():
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

        if not resp.get("ok"):
            err = resp.get("error", {})
            print(f"[ERROR] Gateway pairing failed: {err.get('code', '?')} — {err.get('message', '?')}")
            print("[INFO] You may need to approve: openclaw devices approve --latest")
            print("[WARN] device-auth.json was NOT written — re-run after approval")
            sys.exit(1)

        auth = resp.get("payload", {}).get("auth", {})
        device_token = auth.get("deviceToken", "")
        if not device_token:
            print("[ERROR] Gateway did not return a device token in payload.auth.deviceToken")
            print("[WARN] device-auth.json was NOT written")
            sys.exit(1)

        # Write device-auth.json with the real device-scoped token
        auth_data = {
            "version": 1,
            "deviceId": dev["deviceId"],
            "tokens": {
                "operator": {
                    "token": device_token,
                    "role": auth.get("role", "operator"),
                    "scopes": auth.get("scopes", ["operator.write"]),
                    "updatedAtMs": auth.get("issuedAtMs", ts),
                },
            },
        }
        with open(auth_path, "w") as f:
            json.dump(auth_data, f, indent=2)
            f.write("\n")
        os.chmod(auth_path, 0o600)
        print(f"[OK] Device registered — device-scoped token persisted")
        print(f"[INFO] {auth_path} written")

try:
    asyncio.run(register_and_persist())
except SystemExit:
    raise
except Exception as exc:
    print(f"[ERROR] Gateway registration failed: {exc}")
    print("[WARN] device-auth.json was NOT written — dispatch will not work")
    print("[INFO] Start the Gateway and re-run this script")
    sys.exit(1)
PYREGISTER
fi

echo ""
if [[ -f "$DEVICE_AUTH_JSON" ]]; then
  echo "[OK] Mission Control OpenClaw device-auth provisioning complete"
  echo "     Directory: $TARGET_DIR"
  echo "     device.json:      key pair (native OpenClaw format)"
  echo "     device-auth.json: device-scoped auth token (native OpenClaw format)"
elif [[ "$SKIP_PAIRING" == "true" ]]; then
  # --skip-pairing is an explicit opt-in; exit 0 but warn
  echo "[INCOMPLETE] device.json written, device-auth.json skipped (--skip-pairing)"
else
  # Default mode: incomplete is a hard failure
  echo "[ERROR] Provisioning incomplete — device-auth.json was not created" >&2
  exit 1
fi
