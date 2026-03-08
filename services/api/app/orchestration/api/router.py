from typing import Any

from fastapi import APIRouter, Depends, Query

from app.orchestration.api.schemas import (
    EnvelopePayload,
    RunAttemptResponse,
    RunStateResponse,
    SubmitCommandRequest,
    SubmitCommandResponse,
    TimelineEntryResponse,
    WatchdogSweepRequest,
    WatchdogSweepResponse,
)
from app.orchestration.application.command_service import CommandService
from app.orchestration.application.read_model_service import RunReadModelService
from app.orchestration.application.watchdog_service import WatchdogService
from app.orchestration.dependencies import (
    get_command_service,
    get_run_read_model_service,
    get_watchdog_service,
)
from app.orchestration.domain.models import (
    EnvelopeKind,
    RunAttemptReadModel,
    RunReadModel,
    TimelineEntryReadModel,
)
from app.shared.api.envelope import Envelope, ListEnvelope, ListMeta

router = APIRouter(tags=["orchestration"])


@router.post("/commands", status_code=202)
async def submit_command(
    body: SubmitCommandRequest,
    service: CommandService = Depends(get_command_service),
) -> Envelope[SubmitCommandResponse]:
    command, outbox_event = await service.submit_command(
        command_type=body.command_type,
        schema_version=body.schema_version,
        payload=body.payload,
        metadata=body.metadata.model_dump(),
    )
    response = SubmitCommandResponse(
        status="ACCEPTED",
        command=EnvelopePayload(
            id=command.id,
            kind=EnvelopeKind.COMMAND.value,
            type=command.command_type,
            schema_version=command.schema_version,
            occurred_at=command.occurred_at,
            producer=command.producer,
            correlation_id=command.correlation_id,
            causation_id=command.causation_id,
            payload=command.payload,
        ),
        outbox_event=EnvelopePayload(
            id=outbox_event.id,
            kind=EnvelopeKind.EVENT.value,
            type=outbox_event.event_type,
            schema_version=outbox_event.schema_version,
            occurred_at=outbox_event.occurred_at,
            producer=outbox_event.producer,
            correlation_id=outbox_event.correlation_id,
            causation_id=outbox_event.causation_id,
            payload=outbox_event.payload,
        ),
    )
    return Envelope(data=response)


@router.post("/watchdog/sweep")
async def watchdog_sweep(
    body: WatchdogSweepRequest,
    service: WatchdogService = Depends(get_watchdog_service),
) -> Envelope[WatchdogSweepResponse]:
    decisions = await service.evaluate_stale_runs(
        watchdog_instance=body.watchdog_instance,
        evaluated_at=body.evaluated_at,
    )
    return Envelope(
        data=WatchdogSweepResponse(
            status="OK",
            decisions=decisions,
        )
    )


@router.get("/runs")
async def list_runs(
    run_id: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: RunReadModelService = Depends(get_run_read_model_service),
) -> ListEnvelope[RunStateResponse]:
    runs, total = await service.list_runs(run_id=run_id, status=status, limit=limit, offset=offset)
    return ListEnvelope(
        data=[_to_run_state_response(run) for run in runs],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/runs/{run_id}")
async def get_run(
    run_id: str,
    service: RunReadModelService = Depends(get_run_read_model_service),
) -> Envelope[RunStateResponse]:
    run = await service.get_run(run_id=run_id)
    return Envelope(data=_to_run_state_response(run))


@router.get("/timeline")
async def list_timeline(
    run_id: str | None = Query(None),
    status: str | None = Query(None),
    event_type: str | None = Query(None),
    occurred_after: str | None = Query(None),
    occurred_before: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: RunReadModelService = Depends(get_run_read_model_service),
) -> ListEnvelope[TimelineEntryResponse]:
    entries, total = await service.list_timeline_entries(
        run_id=run_id,
        run_status=status,
        event_type=event_type,
        occurred_after=occurred_after,
        occurred_before=occurred_before,
        limit=limit,
        offset=offset,
    )
    return ListEnvelope(
        data=[_to_timeline_entry_response(entry) for entry in entries],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/runs/{run_id}/attempts")
async def list_run_attempts(
    run_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: RunReadModelService = Depends(get_run_read_model_service),
) -> ListEnvelope[RunAttemptResponse]:
    attempts, total = await service.list_run_attempts(run_id=run_id, limit=limit, offset=offset)
    return ListEnvelope(
        data=[_to_run_attempt_response(attempt) for attempt in attempts],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


def _to_run_state_response(run: RunReadModel) -> RunStateResponse:
    return RunStateResponse(
        run_id=run.run_id,
        status=run.status.value,
        correlation_id=run.correlation_id,
        causation_id=run.causation_id,
        current_step_id=run.current_step_id,
        last_event_type=run.last_event_type,
        run_type=run.run_type,
        lease_owner=run.lease_owner,
        lease_token=run.lease_token,
        last_heartbeat_at=run.last_heartbeat_at,
        watchdog_timeout_at=run.watchdog_timeout_at,
        watchdog_attempt=run.watchdog_attempt,
        watchdog_state=run.watchdog_state,
        terminal_at=run.terminal_at,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


def _to_timeline_entry_response(entry: TimelineEntryReadModel) -> TimelineEntryResponse:
    payload: dict[str, Any] = entry.payload if isinstance(entry.payload, dict) else {}
    is_watchdog_action = entry.event_type == "orchestration.watchdog.action"
    watchdog_action = payload.get("action") if is_watchdog_action else None
    return TimelineEntryResponse(
        id=entry.id,
        run_id=entry.run_id,
        run_status=entry.run_status.value,
        step_id=entry.step_id,
        message_id=entry.message_id,
        event_type=entry.event_type,
        decision=entry.decision.value,
        reason_code=entry.reason_code,
        reason_message=entry.reason_message,
        correlation_id=entry.correlation_id,
        causation_id=entry.causation_id,
        payload=payload,
        occurred_at=entry.occurred_at,
        created_at=entry.created_at,
        is_watchdog_action=is_watchdog_action,
        watchdog_action=(str(watchdog_action) if isinstance(watchdog_action, str) else None),
    )


def _to_run_attempt_response(attempt: RunAttemptReadModel) -> RunAttemptResponse:
    return RunAttemptResponse(
        outbox_event_id=attempt.outbox_event_id,
        command_id=attempt.command_id,
        run_id=attempt.run_id,
        event_type=attempt.event_type,
        occurred_at=attempt.occurred_at,
        status=attempt.status.value,
        retry_attempt=attempt.retry_attempt,
        max_attempts=attempt.max_attempts,
        next_retry_at=attempt.next_retry_at,
        dead_lettered_at=attempt.dead_lettered_at,
        last_error=attempt.last_error,
        correlation_id=attempt.correlation_id,
        causation_id=attempt.causation_id,
    )
