import logging
from dataclasses import dataclass

from app.control_plane.application.ports import AgentQueueRepository
from app.control_plane.domain.models import AgentQueueEntry, AgentQueueStatus
from app.shared.logging import log_event
from app.shared.utils import utc_now

logger = logging.getLogger(__name__)


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
        no new dispatch occurs. Uses CAS transitions for correctness
        under concurrent calls. Idempotent: repeated calls on an
        already-dispatching item are safe.

        Race-safety: the CAS QUEUED→DISPATCHING is the atomic claim
        on a single entry. Concurrent callers targeting the same entry
        will fail the CAS harmlessly. The pre-check has_active_item
        prevents dispatch when an item is already active, but does not
        guard against two callers racing on different QUEUED entries.
        Full DB-level serialisation is deferred to MC-568 (adapter).
        """
        if await self._repo.has_active_item(agent_id=agent_id):
            return DispatchResult(action="skipped", reason="agent_busy")

        candidate = await self._repo.get_oldest_queued_for_agent(agent_id=agent_id)
        if candidate is None:
            return DispatchResult(action="skipped", reason="queue_empty")

        now = utc_now()

        # CAS: QUEUED → DISPATCHING (atomic claim — fails if already transitioned)
        claimed = await self._repo.transition_status(
            entry_id=candidate.id,
            expected_status=AgentQueueStatus.QUEUED,
            new_status=AgentQueueStatus.DISPATCHING,
            updated_at=now,
        )
        if not claimed:
            return DispatchResult(action="skipped", reason="already_transitioning")

        # DISPATCHING → ACK_PENDING
        ack_set = await self._repo.transition_status(
            entry_id=candidate.id,
            expected_status=AgentQueueStatus.DISPATCHING,
            new_status=AgentQueueStatus.ACK_PENDING,
            updated_at=now,
        )
        if not ack_set:
            log_event(
                logger,
                level=logging.WARNING,
                event="control_plane.agent.queue.dispatch_ack_failed",
                agent_id=agent_id,
                queue_entry_id=candidate.id,
            )
            return DispatchResult(action="skipped", reason="transition_conflict")

        await self._repo.commit()

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
                agent_id=agent_id,
                limit=50,
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
