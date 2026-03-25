#!/usr/bin/env bash
set -euo pipefail

# -------------------------------------------------------------------
# setup-openclaw-client-auth.sh
#
# Provisions dedicated Mission Control OpenClaw device-auth material.
#
# The script:
#   1. Generates a fresh Ed25519 key pair for Mission Control
#   2. Reads the Gateway token from openclaw.json (or accepts via env)
#   3. Writes a combined auth file (key material + gateway token)
#   4. Registers the device with the Gateway for pairing
#   5. Waits for operator approval via `openclaw devices approve`
#
# Usage:
#   ./setup-openclaw-client-auth.sh [--target <path>] [--gateway-url <url>]
#
# Environments:
#   PROD:  ./setup-openclaw-client-auth.sh --target /etc/mission-control/openclaw-device-auth.json
#   DEV:   ./setup-openclaw-client-auth.sh --target ./infra/dev/secrets/openclaw-device-auth.json
#   Local: ./setup-openclaw-client-auth.sh --target ./services/api/.openclaw-device-auth.json
#
# Requires: python3 with cryptography package (available in API venv)
# -------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEFAULT_OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
DEFAULT_GATEWAY_URL="ws://127.0.0.1:18789"

TARGET_PATH=""
GATEWAY_URL=""
GATEWAY_TOKEN=""
SKIP_PAIRING=false
FORCE=false

usage() {
  cat <<'EOF'
Usage: setup-openclaw-client-auth.sh [OPTIONS]

Provision dedicated Mission Control OpenClaw device-auth material.

Options:
  --target <path>         Output path for the auth file (required)
  --gateway-url <url>     Gateway WebSocket URL (default: from openclaw.json or ws://127.0.0.1:18789)
  --gateway-token <tok>   Gateway shared token (default: from openclaw.json)
  --skip-pairing          Generate auth file without Gateway pairing (manual token setup)
  --force                 Overwrite existing auth file
  -h, --help              Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)       TARGET_PATH="$2"; shift 2 ;;
    --gateway-url)  GATEWAY_URL="$2"; shift 2 ;;
    --gateway-token) GATEWAY_TOKEN="$2"; shift 2 ;;
    --skip-pairing) SKIP_PAIRING=true; shift ;;
    --force)        FORCE=true; shift ;;
    -h|--help)      usage; exit 0 ;;
    *)              echo "[ERROR] Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$TARGET_PATH" ]]; then
  echo "[ERROR] --target is required" >&2
  usage
  exit 1
fi

if [[ -f "$TARGET_PATH" && "$FORCE" != "true" ]]; then
  echo "[INFO] Auth file already exists: $TARGET_PATH"
  echo "[INFO] Use --force to overwrite"
  exit 0
fi

# Resolve gateway config from openclaw.json if not provided
if [[ -z "$GATEWAY_TOKEN" && -f "$DEFAULT_OPENCLAW_CONFIG" ]]; then
  GATEWAY_TOKEN="$(python3 -c "
import json, sys
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

echo "[INFO] Generating Mission Control OpenClaw device-auth material"
echo "[INFO] Target: $TARGET_PATH"
echo "[INFO] Gateway: $GATEWAY_URL"

# Create target directory if needed
mkdir -p "$(dirname "$TARGET_PATH")"

# Ensure cryptography package is available
if ! python3 -c "import cryptography" 2>/dev/null; then
  echo "[INFO] Installing cryptography package"
  python3 -m pip install --quiet cryptography
fi

# Generate Ed25519 key pair and write combined auth file
python3 - "$TARGET_PATH" "$GATEWAY_TOKEN" "$GATEWAY_URL" "$SKIP_PAIRING" <<'PYTHON'
import asyncio
import base64
import hashlib
import json
import platform
import sys
import time
import uuid

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

target_path = sys.argv[1]
gateway_token = sys.argv[2]
gateway_url = sys.argv[3]
skip_pairing = sys.argv[4] == "true"

PROTOCOL_VERSION = 3
CONNECT_TIMEOUT = 10
RECV_TIMEOUT = 30


def generate_key_pair():
    """Generate a fresh Ed25519 key pair for Mission Control."""
    private_key = Ed25519PrivateKey.generate()
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    pub_raw = private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    device_id = hashlib.sha256(pub_raw).hexdigest()
    return private_key, private_pem, public_pem, device_id, pub_raw


def write_auth_file(path, device_id, private_pem, public_pem, gateway_token):
    """Write the combined MC device-auth file."""
    auth_data = {
        "version": 1,
        "deviceId": device_id,
        "publicKeyPem": public_pem,
        "privateKeyPem": private_pem,
        "gatewayToken": gateway_token,
        "createdAtMs": int(time.time() * 1000),
        "provisionedBy": "setup-openclaw-client-auth.sh",
    }
    with open(path, "w") as f:
        json.dump(auth_data, f, indent=2)
        f.write("\n")
    import os
    os.chmod(path, 0o600)
    print(f"[INFO] Auth file written: {path}")
    print(f"[INFO] Device ID: {device_id}")


async def register_and_pair(private_key, device_id, pub_raw, gateway_token, ws_url):
    """Connect to Gateway to register the device for pairing."""
    try:
        import websockets
    except ImportError:
        print("[WARN] websockets not installed — skipping automatic pairing")
        print("[INFO] After installing websockets, re-run or manually approve the device")
        return False

    pub_b64 = base64.urlsafe_b64encode(pub_raw).rstrip(b"=").decode()

    try:
        async with websockets.connect(ws_url, open_timeout=CONNECT_TIMEOUT) as ws:
            raw = await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT)
            challenge = json.loads(raw)
            nonce = challenge["payload"]["nonce"]

            signed_at_ms = int(time.time() * 1000)
            payload = "|".join([
                "v3", device_id, "cli", "cli", "operator",
                "operator.write", str(signed_at_ms), gateway_token, nonce,
                platform.system().lower(), "",
            ])
            signature = private_key.sign(payload.encode("utf-8"))
            sig_b64 = base64.urlsafe_b64encode(signature).rstrip(b"=").decode()

            connect_msg = {
                "type": "req",
                "id": str(uuid.uuid4()),
                "method": "connect",
                "params": {
                    "auth": {"token": gateway_token},
                    "role": "operator",
                    "scopes": ["operator.write"],
                    "client": {
                        "id": "cli",
                        "mode": "cli",
                        "version": "1.0.0",
                        "platform": platform.system().lower(),
                    },
                    "device": {
                        "id": device_id,
                        "publicKey": pub_b64,
                        "signature": sig_b64,
                        "signedAt": signed_at_ms,
                        "nonce": nonce,
                    },
                    "minProtocol": PROTOCOL_VERSION,
                    "maxProtocol": PROTOCOL_VERSION,
                },
            }
            await ws.send(json.dumps(connect_msg))
            resp = json.loads(await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT))

            if resp.get("ok"):
                print("[OK] Device registered and connected successfully")
                print("[INFO] Device already approved or auto-approved by Gateway")
                return True

            error = resp.get("error", {})
            code = error.get("code", "")
            msg = error.get("message", "unknown")

            if "PENDING" in code.upper() or "APPROVAL" in msg.upper() or "PAIR" in msg.upper():
                print("[INFO] Device pairing request submitted to Gateway")
                print("[INFO] Approve with: openclaw devices approve --latest")
                return True

            print(f"[WARN] Gateway connect response: {code} — {msg}")
            print("[INFO] The auth file has been written. You may need to approve the device manually.")
            print("[INFO] Approve with: openclaw devices approve --latest")
            return True

    except Exception as exc:
        print(f"[WARN] Could not connect to Gateway: {exc}")
        print("[INFO] The auth file has been written.")
        print("[INFO] Start the Gateway and approve the device when ready.")
        return False


private_key, private_pem, public_pem, device_id, pub_raw = generate_key_pair()
write_auth_file(target_path, device_id, private_pem, public_pem, gateway_token)

if not skip_pairing:
    asyncio.run(register_and_pair(private_key, device_id, pub_raw, gateway_token, gateway_url))
else:
    print("[INFO] Skipping Gateway pairing (--skip-pairing)")
    print("[INFO] Device will need to be approved before dispatch works")
PYTHON

echo ""
echo "[OK] Mission Control OpenClaw device-auth provisioning complete"
echo ""
echo "Next steps:"
echo "  1. If pairing was requested, approve: openclaw devices approve --latest"
echo "  2. Verify: cat $TARGET_PATH | python3 -c 'import sys,json; d=json.load(sys.stdin); print(\"deviceId:\", d[\"deviceId\"])'"
echo "  3. Ensure the env/compose config points to this file"
