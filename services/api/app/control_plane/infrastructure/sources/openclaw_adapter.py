import asyncio
import base64
import json
import logging
import platform
import time
import uuid

import websockets
from cryptography.hazmat.primitives import serialization

from app.control_plane.application.ports import OpenClawDispatchPort
from app.control_plane.domain.models import DispatchEnvelope, OpenClawSessionMetadata
from app.shared.logging import log_event

logger = logging.getLogger(__name__)

_CONNECT_TIMEOUT_SECONDS = 10
_RECV_TIMEOUT_SECONDS = 30
_MAX_RECV_FRAMES = 50
_PROTOCOL_VERSION = 3


class GatewayWsDispatchAdapter(OpenClawDispatchPort):
    """Dispatches work to an agent's main session via OpenClaw Gateway WS RPC.

    Connects to the Gateway WebSocket, authenticates with token + device
    identity, and calls chat.send to deliver the dispatch prompt to the
    assigned agent's main session.

    Auth model: the Gateway requires both a shared token AND an Ed25519
    device identity to grant operator.write scope (needed for chat.send).
    Token-only auth is insufficient — it grants read scope only. This is
    a Gateway-level security policy, not an MC design choice. The API
    runtime therefore acts as a privileged Gateway client that must have:
      - MC_API_OPENCLAW_GATEWAY_URL  (WebSocket URL)
      - MC_API_OPENCLAW_GATEWAY_TOKEN  (shared auth token)
      - MC_API_OPENCLAW_DEVICE_IDENTITY_PATH  (Ed25519 key pair JSON)

    chat.send semantics: a successful response (ok=true, status=started)
    means the Gateway accepted the message and injected it into the target
    agent session. It does NOT mean the agent has processed or acknowledged
    the message — that happens asynchronously via runtime callbacks.

    Production-safe: works from any runtime (container, VM, host) that
    can reach the Gateway WebSocket URL.
    """

    def __init__(
        self,
        *,
        gateway_url: str,
        gateway_token: str,
        device_identity_path: str,
    ) -> None:
        if not gateway_token:
            log_event(
                logger,
                level=logging.WARNING,
                event="control_plane.dispatch.adapter.no_token",
            )
        self._ws_url = gateway_url.replace("http://", "ws://").replace("https://", "wss://")
        self._token = gateway_token
        self._device_path = device_identity_path
        self._device: dict | None = None

    async def send_dispatch(
        self,
        *,
        envelope: DispatchEnvelope,
    ) -> OpenClawSessionMetadata:
        if not self._token:
            msg = "OpenClaw Gateway token not configured (MC_API_OPENCLAW_GATEWAY_TOKEN)"
            raise RuntimeError(msg)
        self._get_device()  # fail-fast if not configured
        prompt = self._build_prompt(envelope)
        idempotency_key = f"mc-dispatch-{envelope.run_id}"

        log_event(
            logger,
            level=logging.INFO,
            event="control_plane.dispatch.adapter.sending",
            agent_id=envelope.agent_id,
            main_session_key=envelope.main_session_key,
            run_id=envelope.run_id,
            work_item_key=envelope.work_item_key,
        )

        try:
            async with websockets.connect(
                self._ws_url,
                open_timeout=_CONNECT_TIMEOUT_SECONDS,
            ) as ws:
                await self._authenticate(ws)

                result = await self._chat_send(
                    ws,
                    session_key=envelope.main_session_key,
                    message=prompt,
                    idempotency_key=idempotency_key,
                )
        except websockets.exceptions.WebSocketException as exc:
            msg = f"Gateway WebSocket error: {exc}"
            raise RuntimeError(msg) from exc
        except TimeoutError as exc:
            msg = f"Gateway dispatch timeout: {exc}"
            raise RuntimeError(msg) from exc

        run_id = result.get("runId", envelope.run_id)

        log_event(
            logger,
            level=logging.INFO,
            event="control_plane.dispatch.adapter.sent",
            agent_id=envelope.agent_id,
            run_id=run_id,
            main_session_key=envelope.main_session_key,
            gateway_status=result.get("status"),
        )

        return OpenClawSessionMetadata(process_id=None)

    def _get_device(self) -> dict:
        if self._device is not None:
            return self._device
        if not self._device_path:
            msg = "OpenClaw device identity not configured (MC_API_OPENCLAW_DEVICE_IDENTITY_PATH)"
            raise RuntimeError(msg)
        try:
            self._device = self._load_device_identity(self._device_path)
        except Exception as exc:
            msg = f"Failed to load OpenClaw device identity from {self._device_path}: {exc}"
            raise RuntimeError(msg) from exc
        return self._device

    async def _authenticate(self, ws: websockets.ClientConnection) -> None:
        """Complete Gateway connect handshake with device identity auth."""
        raw = await asyncio.wait_for(ws.recv(), timeout=_RECV_TIMEOUT_SECONDS)
        try:
            challenge = json.loads(raw)
            nonce = challenge["payload"]["nonce"]
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            msg = f"Malformed gateway challenge frame: {exc}"
            raise RuntimeError(msg) from exc

        signed_at_ms = int(time.time() * 1000)
        device_payload = self._build_device_auth_payload(
            nonce=nonce,
            signed_at_ms=signed_at_ms,
        )
        signature = self._sign_payload(device_payload)

        connect = {
            "type": "req",
            "id": str(uuid.uuid4()),
            "method": "connect",
            "params": {
                "auth": {"token": self._token},
                "role": "operator",
                "scopes": ["operator.write"],
                "client": {
                    "id": "gateway-client",
                    "mode": "backend",
                    "version": "1.0.0",
                    "platform": platform.system().lower(),
                },
                "device": {
                    "id": self._get_device()["deviceId"],
                    "publicKey": self._get_device()["publicKeyB64"],
                    "signature": signature,
                    "signedAt": signed_at_ms,
                    "nonce": nonce,
                },
                "minProtocol": _PROTOCOL_VERSION,
                "maxProtocol": _PROTOCOL_VERSION,
            },
        }
        await ws.send(json.dumps(connect))
        resp = json.loads(await asyncio.wait_for(ws.recv(), timeout=_RECV_TIMEOUT_SECONDS))
        if not resp.get("ok"):
            error = resp.get("error", {})
            msg = f"Gateway connect failed: {error.get('message', 'unknown')}"
            raise RuntimeError(msg)

    async def _chat_send(
        self,
        ws: websockets.ClientConnection,
        *,
        session_key: str,
        message: str,
        idempotency_key: str,
    ) -> dict:
        """Send chat.send RPC and wait for the response."""
        req = {
            "type": "req",
            "id": idempotency_key,
            "method": "chat.send",
            "params": {
                "sessionKey": session_key,
                "message": message,
                "idempotencyKey": idempotency_key,
            },
        }
        await ws.send(json.dumps(req))

        # Read frames until we get the response (bounded by frame count)
        for _ in range(_MAX_RECV_FRAMES):
            raw = await asyncio.wait_for(ws.recv(), timeout=_RECV_TIMEOUT_SECONDS)
            frame = json.loads(raw)
            if frame.get("type") == "res" and frame.get("id") == idempotency_key:
                if not frame.get("ok"):
                    error = frame.get("error", {})
                    msg = f"Gateway chat.send failed: {error.get('message', 'unknown')}"
                    raise RuntimeError(msg)
                return frame.get("payload", {})

        msg = f"Gateway did not respond to chat.send within {_MAX_RECV_FRAMES} frames"
        raise RuntimeError(msg)

    def _build_device_auth_payload(
        self,
        *,
        nonce: str,
        signed_at_ms: int,
    ) -> str:
        return "|".join(
            [
                "v3",
                self._get_device()["deviceId"],
                "gateway-client",
                "backend",
                "operator",
                "operator.write",
                str(signed_at_ms),
                self._token,
                nonce,
                platform.system().lower(),
                "",
            ]
        )

    def _sign_payload(self, payload: str) -> str:
        signature = self._get_device()["privateKey"].sign(payload.encode("utf-8"))
        return base64.urlsafe_b64encode(signature).rstrip(b"=").decode()

    @staticmethod
    def _load_device_identity(path: str) -> dict:
        with open(path) as f:
            data = json.load(f)
        private_key = serialization.load_pem_private_key(
            data["privateKeyPem"].encode(),
            password=None,
        )
        public_key = private_key.public_key()
        pub_raw = public_key.public_bytes(
            serialization.Encoding.Raw,
            serialization.PublicFormat.Raw,
        )
        return {
            "deviceId": data["deviceId"],
            "privateKey": private_key,
            "publicKeyB64": base64.urlsafe_b64encode(pub_raw).rstrip(b"=").decode(),
        }

    @staticmethod
    def _build_prompt(envelope: DispatchEnvelope) -> str:
        return (
            f"{envelope.prompt_marker} Implement only this story.\n"
            f"\n"
            f"Work item: {envelope.work_item_key} — {envelope.work_item_title}\n"
            f"Repo root: {envelope.repo_root}\n"
            f"Work dir: {envelope.work_dir}\n"
            f"Contract: {envelope.contract_version}\n"
            f"Run ID: {envelope.run_id}\n"
            f"Correlation ID: {envelope.correlation_id}\n"
            f"\n"
            f"Report progress via runtime callbacks "
            f"(agent.assignment.accepted, agent.execution.spawned, etc.)."
        )
