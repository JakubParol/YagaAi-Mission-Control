import logging
from dataclasses import dataclass

from app.control_plane.application.ports import NaomiQueueRepository
from app.control_plane.domain.models import (
    NAOMI_AGENT_KEY,
    QUEUE_ELIGIBLE_PLANNING_STATUSES,
    QUEUE_ELIGIBLE_WORK_ITEM_TYPES,
    NaomiQueueEntry,
    NaomiQueueStatus,
)
from app.shared.logging import log_event
from app.shared.utils import new_uuid, utc_now

logger = logging.getLogger(__name__)


@dataclass
class IngressResult:
    action: str  # "enqueued" | "cancelled" | "skipped"
    queue_entry_id: str | None = None
    reason: str | None = None


class NaomiQueueIngressService:
    def __init__(self, repo: NaomiQueueRepository) -> None:
        self._repo = repo

    async def handle_assignment_changed(
        self,
        *,
        work_item_id: str,
        work_item_key: str,
        work_item_type: str,
        work_item_status: str,
        agent_id: str | None,
        previous_agent_id: str | None,
        agent_openclaw_key: str | None,
        previous_agent_openclaw_key: str | None,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> IngressResult:
        correlation_id = correlation_id or new_uuid()

        was_naomi = previous_agent_openclaw_key == NAOMI_AGENT_KEY
        is_naomi = agent_openclaw_key == NAOMI_AGENT_KEY

        if was_naomi and not is_naomi:
            return await self._cancel_queued(
                work_item_id=work_item_id,
                work_item_key=work_item_key,
            )

        if not is_naomi:
            return IngressResult(
                action="skipped",
                reason="not_naomi",
            )

        if not self._is_eligible(work_item_type, work_item_status):
            return IngressResult(
                action="skipped",
                reason="not_eligible",
            )

        existing = await self._repo.get_active_by_work_item(
            work_item_id=work_item_id
        )
        if existing is not None:
            return IngressResult(
                action="skipped",
                queue_entry_id=existing.id,
                reason="already_queued",
            )

        return await self._enqueue(
            work_item_id=work_item_id,
            work_item_key=work_item_key,
            work_item_type=work_item_type,
            agent_id=agent_id or "",
            correlation_id=correlation_id,
            causation_id=causation_id,
        )

    async def list_queue(
        self,
        *,
        agent_id: str,
        status: NaomiQueueStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[NaomiQueueEntry], int]:
        return await self._repo.list_queued_by_agent(
            agent_id=agent_id,
            status=status,
            limit=limit,
            offset=offset,
        )

    @staticmethod
    def _is_eligible(work_item_type: str, work_item_status: str) -> bool:
        return (
            work_item_type in QUEUE_ELIGIBLE_WORK_ITEM_TYPES
            and work_item_status in QUEUE_ELIGIBLE_PLANNING_STATUSES
        )

    async def _enqueue(
        self,
        *,
        work_item_id: str,
        work_item_key: str,
        work_item_type: str,
        agent_id: str,
        correlation_id: str,
        causation_id: str | None,
    ) -> IngressResult:
        now = utc_now()
        position = await self._repo.next_queue_position(agent_id=agent_id)
        entry_id = new_uuid()

        entry = NaomiQueueEntry(
            id=entry_id,
            work_item_id=work_item_id,
            work_item_key=work_item_key,
            work_item_type=work_item_type,
            agent_id=agent_id,
            status=NaomiQueueStatus.QUEUED,
            queue_position=position,
            correlation_id=correlation_id,
            causation_id=causation_id,
            enqueued_at=now,
            updated_at=now,
        )
        await self._repo.enqueue(entry=entry)

        log_event(
            logger,
            level=logging.INFO,
            event="control_plane.naomi.queue.enqueued",
            work_item_id=work_item_id,
            work_item_key=work_item_key,
            queue_entry_id=entry_id,
            queue_position=position,
            correlation_id=correlation_id,
        )

        return IngressResult(
            action="enqueued",
            queue_entry_id=entry_id,
        )

    async def _cancel_queued(
        self,
        *,
        work_item_id: str,
        work_item_key: str,
    ) -> IngressResult:
        now = utc_now()
        cancelled = await self._repo.cancel_by_work_item(
            work_item_id=work_item_id,
            cancelled_at=now,
        )
        if not cancelled:
            return IngressResult(
                action="skipped",
                reason="no_active_queue_entry",
            )

        log_event(
            logger,
            level=logging.INFO,
            event="control_plane.naomi.queue.cancelled",
            work_item_id=work_item_id,
            work_item_key=work_item_key,
        )

        return IngressResult(action="cancelled")
