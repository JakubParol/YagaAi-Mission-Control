import logging
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.config import settings
from app.orchestration.application.worker_state_machine_service import WorkerStateMachineService
from app.orchestration.dependencies import get_worker_state_machine_service
from app.shared.logging import log_event

router = APIRouter(tags=["orchestration"])
logger = logging.getLogger(__name__)

_DAPR_HTTP_BASE = "http://127.0.0.1:3500"
_PUBSUB_NAME = "local-pubsub"
_TOPIC_NAME = "orchestration.events"
_STATESTORE_NAME = "local-statestore"
_WORKER_APP_ID = "mission-control-worker"


def _extract_causation_id(cloud_event: dict[str, Any], data: dict[str, Any]) -> str | None:
    for key in ("causation_id", "causationId"):
        raw = data.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()

    traceparent = cloud_event.get("traceparent")
    if isinstance(traceparent, str) and traceparent.strip():
        return traceparent.strip()

    return None


@router.get("/dapr/subscribe")
async def dapr_subscribe() -> list[dict[str, Any]]:
    if not settings.orchestration_dapr_ingest_enabled:
        return []
    return [
        {
            "pubsubname": _PUBSUB_NAME,
            "topic": _TOPIC_NAME,
            "routes": {"default": "v1/orchestration/dapr/events"},
        }
    ]


@router.get("/healthz/dapr")
async def dapr_healthz() -> dict[str, str]:
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            response = await client.get(f"{_DAPR_HTTP_BASE}/v1.0/metadata")
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Dapr sidecar metadata unavailable: {error}",
            ) from error
    return {"status": "ok"}


@router.post("/v1/orchestration/dapr/events")
async def handle_dapr_orchestration_event(
    cloud_event: dict[str, Any],
    worker_state_service: WorkerStateMachineService = Depends(get_worker_state_machine_service),
) -> dict[str, str]:
    if not settings.orchestration_dapr_ingest_enabled:
        log_event(
            logger,
            level=logging.WARNING,
            event="orchestration.dapr.event_ignored",
            reason="ORCHESTRATION_DAPR_INGEST_DISABLED",
        )
        return {
            "status": "IGNORED",
            "reason": "ORCHESTRATION_DAPR_INGEST_DISABLED",
            "run_id": str(cloud_event.get("run_id") or "unknown-run"),
            "occurred_at": datetime.now(tz=UTC).isoformat(),
            "transition_decision": "IGNORED",
        }

    data = cloud_event.get("data")
    if not isinstance(data, dict):
        data = cloud_event

    run_id = str(data.get("run_id") or "unknown-run")
    event_type = str(data.get("type") or cloud_event.get("type") or "unknown-event")
    message_id = str(cloud_event.get("id") or f"{run_id}:{event_type}")
    correlation_id = str(
        data.get("correlation_id") or cloud_event.get("traceid") or "unknown-correlation"
    )
    causation_id = _extract_causation_id(cloud_event, data)
    occurred_at = str(data.get("occurred_at") or datetime.now(tz=UTC).isoformat())
    event_payload = data.get("payload")
    if not isinstance(event_payload, dict):
        event_payload = {}
    traceid = cloud_event.get("traceid")
    if isinstance(traceid, str) and traceid.strip():
        event_payload.setdefault("trace_id", traceid.strip())
    traceparent = cloud_event.get("traceparent")
    if isinstance(traceparent, str) and traceparent.strip():
        event_payload.setdefault("traceparent", traceparent.strip())
    tracestate = cloud_event.get("tracestate")
    if isinstance(tracestate, str) and tracestate.strip():
        event_payload.setdefault("tracestate", tracestate.strip())

    worker_result = await worker_state_service.process_message(
        stream_key="dapr:orchestration.events",
        consumer_group=settings.orchestration_worker_consumer_group,
        consumer_name="dapr-bridge",
        message_id=message_id,
        run_id=run_id,
        event_type=event_type,
        correlation_id=correlation_id,
        causation_id=causation_id,
        occurred_at=occurred_at,
        payload=event_payload,
    )
    log_event(
        logger,
        level=logging.INFO,
        event="orchestration.dapr.event_ingested",
        run_id=run_id,
        event_type=event_type,
        correlation_id=correlation_id,
        causation_id=causation_id,
        message_id=message_id,
        decision=str(worker_result.get("decision", "")),
    )

    state_key = f"orchestration:last-event:{run_id}"
    state_payload = {
        "run_id": run_id,
        "received_at": datetime.now(tz=UTC).isoformat(),
        "correlation_id": correlation_id,
        "causation_id": causation_id,
        "event": data,
    }
    ack_payload = {
        "run_id": run_id,
        "acknowledged_at": datetime.now(tz=UTC).isoformat(),
        "correlation_id": correlation_id,
        "causation_id": causation_id,
        "status": "ACCEPTED",
    }

    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            save_state_response = await client.post(
                f"{_DAPR_HTTP_BASE}/v1.0/state/{_STATESTORE_NAME}",
                json=[{"key": state_key, "value": state_payload}],
            )
            save_state_response.raise_for_status()
        except httpx.HTTPError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to persist orchestration event in Dapr state store: {error}",
            ) from error

        try:
            invoke_response = await client.post(
                (f"{_DAPR_HTTP_BASE}/v1.0/invoke/{_WORKER_APP_ID}" "/method/orchestration/ack"),
                json=ack_payload,
            )
            invoke_response.raise_for_status()
        except httpx.HTTPError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to invoke worker acknowledgement endpoint via Dapr: {error}",
            ) from error

    return {
        "status": "SUCCESS",
        "run_id": run_id,
        "occurred_at": occurred_at,
        "transition_decision": str(worker_result.get("decision", "")),
    }
