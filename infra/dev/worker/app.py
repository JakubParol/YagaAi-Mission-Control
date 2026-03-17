#!/usr/bin/env python3
import json
import os
import socket
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

API_HEALTH_URL = os.environ.get("MC_WORKER_API_HEALTH_URL", "http://api:5100/healthz")
REDIS_HOST = os.environ.get("MC_WORKER_REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("MC_WORKER_REDIS_PORT", "6379"))
WORKER_APP_PORT = int(os.environ.get("MC_WORKER_APP_PORT", "8000"))
DAPR_HTTP_URL = os.environ.get("MC_WORKER_DAPR_HTTP_URL", "http://127.0.0.1:3520")
PUBSUB_NAME = os.environ.get("MC_WORKER_DAPR_PUBSUB", "local-pubsub")
PUBSUB_TOPIC = os.environ.get("MC_WORKER_DAPR_TOPIC", "control-plane.events")
STATESTORE_NAME = os.environ.get("MC_WORKER_DAPR_STATESTORE", "local-statestore")
PUBLISH_INTERVAL_SECONDS = int(os.environ.get("MC_WORKER_PUBLISH_INTERVAL_SECONDS", "15"))


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


SYNTHETIC_EVENTS_ENABLED = _env_flag("MC_WORKER_SYNTHETIC_EVENTS_ENABLED", False)

_state_lock = threading.Lock()
_latest_ack: dict[str, Any] | None = None
_latest_publish: dict[str, Any] | None = None
_last_error: str | None = None


def _iso_now() -> str:
    return datetime.now(tz=UTC).isoformat()


def _log(level: str, event: str, **fields: object) -> None:
    payload = {
        "timestamp": _iso_now(),
        "level": level,
        "service": "mission-control-worker",
        "event": event,
        **fields,
    }
    print(json.dumps(payload, separators=(",", ":"), sort_keys=True), flush=True)


def _check_api_health() -> None:
    with urllib.request.urlopen(API_HEALTH_URL, timeout=3):
        return


def _check_redis_health() -> None:
    with socket.create_connection((REDIS_HOST, REDIS_PORT), timeout=3):
        return


def _post_json(url: str, payload: Any) -> None:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url=url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5):
        return


def _publish_control_plane_event() -> None:
    event = {
        "event_id": str(uuid.uuid4()),
        "run_id": f"local-run-{int(time.time())}",
        "producer": "mission-control-worker",
        "correlation_id": str(uuid.uuid4()),
        "occurred_at": _iso_now(),
        "type": "control-plane.run.submit.accepted",
        "payload": {"source": "dev-runtime-worker", "status": "heartbeat"},
    }

    _post_json(f"{DAPR_HTTP_URL}/v1.0/publish/{PUBSUB_NAME}/{PUBSUB_TOPIC}", event)
    _post_json(
        f"{DAPR_HTTP_URL}/v1.0/state/{STATESTORE_NAME}",
        [{"key": "worker:last-published-event", "value": event}],
    )

    with _state_lock:
        global _latest_publish
        _latest_publish = event
    _log(
        "INFO",
        "worker.control_plane_event.published",
        run_id=event["run_id"],
        event_type=event["type"],
        correlation_id=event["correlation_id"],
        event_id=event["event_id"],
    )


def _set_last_error(error: str | None) -> None:
    with _state_lock:
        global _last_error
        _last_error = error


def _publisher_loop() -> None:
    while True:
        try:
            _check_api_health()
            _check_redis_health()
            _publish_control_plane_event()
            _set_last_error(None)
        except (OSError, urllib.error.URLError, urllib.error.HTTPError, ValueError) as error:
            _set_last_error(str(error))
            _log("ERROR", "worker.control_plane_event.publish_failed", error=str(error))
        time.sleep(PUBLISH_INTERVAL_SECONDS)


class WorkerHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/healthz":
            self._send_json(404, {"error": "not_found"})
            return
        with _state_lock:
            payload = {
                "status": "ok",
                "api_health_url": API_HEALTH_URL,
                "redis": f"{REDIS_HOST}:{REDIS_PORT}",
                "dapr_http_url": DAPR_HTTP_URL,
                "synthetic_events_enabled": SYNTHETIC_EVENTS_ENABLED,
                "publish_interval_seconds": PUBLISH_INTERVAL_SECONDS,
                "latest_publish": _latest_publish,
                "latest_ack": _latest_ack,
                "last_error": _last_error,
            }
        self._send_json(200, payload)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/control-plane/ack":
            self._send_json(404, {"error": "not_found"})
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        payload = json.loads(body.decode("utf-8"))
        with _state_lock:
            global _latest_ack
            _latest_ack = payload
        _log(
            "INFO",
            "worker.control_plane_ack.received",
            run_id=str(payload.get("run_id", "")),
            correlation_id=str(payload.get("correlation_id", "")),
            causation_id=str(payload.get("causation_id", "")),
            status=str(payload.get("status", "")),
        )
        self._send_json(200, {"status": "ACK_RECEIVED"})

    def log_message(self, format: str, *args: Any) -> None:
        _log("INFO", "worker.http.access", message=format % args)


def main() -> None:
    if SYNTHETIC_EVENTS_ENABLED:
        publisher = threading.Thread(target=_publisher_loop, daemon=True)
        publisher.start()
        _log(
            "INFO",
            "worker.synthetic_publisher.enabled",
            interval_seconds=PUBLISH_INTERVAL_SECONDS,
        )
    else:
        _log(
            "INFO",
            "worker.synthetic_publisher.disabled",
            reason="MC_WORKER_SYNTHETIC_EVENTS_ENABLED=false",
        )

    server = ThreadingHTTPServer(("0.0.0.0", WORKER_APP_PORT), WorkerHandler)
    _log("INFO", "worker.http.started", bind=f"0.0.0.0:{WORKER_APP_PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
