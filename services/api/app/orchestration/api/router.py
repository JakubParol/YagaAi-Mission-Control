from fastapi import APIRouter, Depends

from app.orchestration.api.schemas import (
    EnvelopePayload,
    SubmitCommandRequest,
    SubmitCommandResponse,
    WatchdogSweepRequest,
    WatchdogSweepResponse,
)
from app.orchestration.application.command_service import CommandService
from app.orchestration.application.watchdog_service import WatchdogService
from app.orchestration.dependencies import get_command_service, get_watchdog_service
from app.orchestration.domain.models import EnvelopeKind
from app.shared.api.envelope import Envelope

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
