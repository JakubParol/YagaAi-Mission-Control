from fastapi import APIRouter, Depends, Query

from app.control_plane.api.schemas import (
    AgentQueueEntryResponse,
    AgentQueueSummaryResponse,
    DispatchRequest,
    DispatchResponse,
    QueueIngressRequest,
    QueueIngressResponse,
)
from app.control_plane.application.dispatch_selection_service import DispatchSelectionService
from app.control_plane.application.queue_ingress_service import QueueIngressService
from app.control_plane.dependencies import get_dispatch_selection_service, get_queue_ingress_service
from app.control_plane.domain.models import AgentQueueEntry, AgentQueueStatus
from app.shared.api.envelope import Envelope, ListEnvelope, ListMeta
from app.shared.api.errors import ValidationError

router = APIRouter(prefix="/agent-queue", tags=["control-plane-agent-queue"])


@router.post("/ingest", status_code=200)
async def queue_ingest(
    body: QueueIngressRequest,
    service: QueueIngressService = Depends(get_queue_ingress_service),
) -> Envelope[QueueIngressResponse]:
    result = await service.handle_assignment_changed(
        work_item_id=body.work_item_id,
        work_item_key=body.work_item_key,
        work_item_type=body.work_item_type,
        work_item_title=body.work_item_title,
        work_item_status=body.work_item_status,
        agent_id=body.agent_id,
        previous_agent_id=body.previous_agent_id,
        correlation_id=body.correlation_id,
        causation_id=body.causation_id,
    )
    return Envelope(
        data=QueueIngressResponse(
            action=result.action,
            queue_entry_id=result.queue_entry_id,
            reason=result.reason,
        )
    )


@router.get("")
async def list_agent_queue(
    agent_id: str = Query(..., min_length=1),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: QueueIngressService = Depends(get_queue_ingress_service),
) -> ListEnvelope[AgentQueueEntryResponse]:
    queue_status: AgentQueueStatus | None = None
    if status:
        try:
            queue_status = AgentQueueStatus(status)
        except ValueError as exc:
            valid = ", ".join(s.value for s in AgentQueueStatus)
            raise ValidationError(f"Invalid status '{status}'. Allowed: {valid}") from exc
    entries, total = await service.list_queue(
        agent_id=agent_id,
        status=queue_status,
        limit=limit,
        offset=offset,
    )
    return ListEnvelope(
        data=[_to_response(e) for e in entries],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.post("/dispatch", status_code=200)
async def dispatch_next(
    body: DispatchRequest,
    service: DispatchSelectionService = Depends(get_dispatch_selection_service),
) -> Envelope[DispatchResponse]:
    result = await service.try_dispatch_next(agent_id=body.agent_id)
    return Envelope(
        data=DispatchResponse(
            action=result.action,
            entry=_to_response(result.entry) if result.entry else None,
            reason=result.reason,
        )
    )


@router.get("/status")
async def agent_queue_status(
    agent_id: str = Query(..., min_length=1),
    service: DispatchSelectionService = Depends(get_dispatch_selection_service),
) -> Envelope[AgentQueueSummaryResponse]:
    summary = await service.get_agent_queue_summary(agent_id=agent_id)
    return Envelope(
        data=AgentQueueSummaryResponse(
            agent_id=summary.agent_id,
            has_active_item=summary.has_active_item,
            active_entry=(_to_response(summary.active_entry) if summary.active_entry else None),
            queued_count=summary.queued_count,
            queued_entries=[_to_response(e) for e in summary.queued_entries],
        )
    )


def _to_response(entry: AgentQueueEntry) -> AgentQueueEntryResponse:
    return AgentQueueEntryResponse(
        id=entry.id,
        work_item_id=entry.work_item_id,
        work_item_key=entry.work_item_key,
        work_item_type=entry.work_item_type,
        work_item_title=entry.work_item_title,
        agent_id=entry.agent_id,
        status=entry.status.value,
        queue_position=entry.queue_position,
        correlation_id=entry.correlation_id,
        causation_id=entry.causation_id,
        enqueued_at=entry.enqueued_at,
        updated_at=entry.updated_at,
        cancelled_at=entry.cancelled_at,
    )
