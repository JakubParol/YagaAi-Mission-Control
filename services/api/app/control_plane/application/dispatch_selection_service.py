import logging
from dataclasses import dataclass

from app.control_plane.application.ports import AgentQueueRepository
from app.control_plane.domain.models import AgentQueueEntry, AgentQueueStatus
from app.shared.logging import log_event
from app.shared.utils import utc_now

logger = logging.getLogger(__name__)

# v1 specialist capacity: one active work item per agent
AGENT_CAPACITY = 1


@dataclass
class DispatchResult:
    action: str  # "dispatched" | "skipped"
    entry: AgentQueueEntry | None = None
    reason: str | None = None


@dataclass
class AgentQueueSummary:
    agent_id: str
    has_active_item: bool
    active_entry: AgentQueueEntry | None
    queued_count: int
    queued_entries: list[AgentQueueEntry]


class DispatchSelectionService:
    def __init__(self, repo: AgentQueueRepository) -> None:
        self._repo = repo

    async def try_dispatch_next(self, *, agent_id: str) -> DispatchResult:
        """Select and begin dispatching the oldest queued item for an agent.

        Enforces capacity=1: if the agent already has an active item,
        no new dispatch occurs. Transitions QUEUED → DISPATCHING → ACK_PENDING
        atomically. Idempotent: repeated calls on an already-dispatching item
        are safe (the CAS transition will simply not match).
        """
        if await self._repo.has_active_item(agent_id=agent_id):
            return DispatchResult(action="skipped", reason="agent_busy")

        candidate = await self._repo.get_oldest_queued_for_agent(agent_id=agent_id)
        if candidate is None:
            return DispatchResult(action="skipped", reason="queue_empty")

        now = utc_now()

        # CAS: QUEUED → DISPATCHING (idempotent — fails silently if already transitioned)
        transitioned = await self._repo.transition_status(
            entry_id=candidate.id,
            expected_status=AgentQueueStatus.QUEUED,
            new_status=AgentQueueStatus.DISPATCHING,
            updated_at=now,
        )
        if not transitioned:
            return DispatchResult(action="skipped", reason="already_transitioning")

        # DISPATCHING → ACK_PENDING
        await self._repo.transition_status(
            entry_id=candidate.id,
            expected_status=AgentQueueStatus.DISPATCHING,
            new_status=AgentQueueStatus.ACK_PENDING,
            updated_at=now,
        )

        # Re-read the entry to return the updated state
        updated = await self._repo.get_active_by_work_item(
            work_item_id=candidate.work_item_id,
        )
        dispatched_entry = updated or candidate

        log_event(
            logger,
            level=logging.INFO,
            event="control_plane.agent.queue.dispatched",
            agent_id=agent_id,
            queue_entry_id=candidate.id,
            work_item_id=candidate.work_item_id,
            work_item_key=candidate.work_item_key,
            correlation_id=candidate.correlation_id,
        )

        return DispatchResult(action="dispatched", entry=dispatched_entry)

    async def get_agent_queue_summary(
        self,
        *,
        agent_id: str,
    ) -> AgentQueueSummary:
        """Return a summary of active-vs-queued state for an agent."""
        has_active = await self._repo.has_active_item(agent_id=agent_id)

        # Find the current active entry (if any)
        active_entry: AgentQueueEntry | None = None
        if has_active:
            active_entries, _ = await self._repo.list_queued_by_agent(
                agent_id=agent_id, limit=50,
            )
            for entry in active_entries:
                if entry.status not in (
                    AgentQueueStatus.QUEUED,
                    AgentQueueStatus.DONE,
                    AgentQueueStatus.FAILED,
                    AgentQueueStatus.CANCELLED,
                ):
                    active_entry = entry
                    break

        queued_entries, queued_count = await self._repo.list_queued_by_agent(
            agent_id=agent_id,
            status=AgentQueueStatus.QUEUED,
        )

        return AgentQueueSummary(
            agent_id=agent_id,
            has_active_item=has_active,
            active_entry=active_entry,
            queued_count=queued_count,
            queued_entries=queued_entries,
        )
