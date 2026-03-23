"""Shared in-memory fake for AgentQueueRepository used across queue tests."""

from app.control_plane.application.ports import AgentQueueRepository
from app.control_plane.domain.models import AgentQueueEntry, AgentQueueStatus

_ACTIVE_RUNTIME = frozenset(
    {
        AgentQueueStatus.DISPATCHING,
        AgentQueueStatus.ACK_PENDING,
        AgentQueueStatus.PLANNING,
        AgentQueueStatus.EXECUTING,
        AgentQueueStatus.BLOCKED,
        AgentQueueStatus.REVIEW_READY,
    }
)


class FakeAgentQueueRepo(AgentQueueRepository):
    """In-memory fake that implements the full AgentQueueRepository port."""

    def __init__(self) -> None:
        self.entries: list[AgentQueueEntry] = []

    async def enqueue(self, *, entry: AgentQueueEntry) -> None:
        pos = (
            max(
                (
                    e.queue_position
                    for e in self.entries
                    if e.agent_id == entry.agent_id and e.status == AgentQueueStatus.QUEUED
                ),
                default=0,
            )
            + 1
        )
        entry.queue_position = pos
        self.entries.append(entry)

    async def get_active_by_work_item(self, *, work_item_id: str) -> AgentQueueEntry | None:
        for e in self.entries:
            if e.work_item_id == work_item_id and e.status in (
                AgentQueueStatus.QUEUED,
                AgentQueueStatus.DISPATCHING,
                AgentQueueStatus.ACK_PENDING,
            ):
                return e
        return None

    async def cancel_by_work_item(self, *, work_item_id: str, cancelled_at: str) -> bool:
        found = False
        for e in self.entries:
            if e.work_item_id == work_item_id and e.status in (
                AgentQueueStatus.QUEUED,
                AgentQueueStatus.DISPATCHING,
                AgentQueueStatus.ACK_PENDING,
            ):
                e.status = AgentQueueStatus.CANCELLED
                e.cancelled_at = cancelled_at
                found = True
        return found

    async def next_queue_position(self, *, agent_id: str) -> int:
        positions = [
            e.queue_position
            for e in self.entries
            if e.agent_id == agent_id and e.status == AgentQueueStatus.QUEUED
        ]
        return max(positions, default=0) + 1

    async def list_queued_by_agent(
        self,
        *,
        agent_id: str,
        status: AgentQueueStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[AgentQueueEntry], int]:
        filtered = [e for e in self.entries if e.agent_id == agent_id]
        if status is not None:
            filtered = [e for e in filtered if e.status == status]
        filtered.sort(key=lambda e: e.queue_position)
        total = len(filtered)
        return filtered[offset : offset + limit], total

    async def get_oldest_queued_for_agent(
        self,
        *,
        agent_id: str,
    ) -> AgentQueueEntry | None:
        queued = [
            e
            for e in self.entries
            if e.agent_id == agent_id and e.status == AgentQueueStatus.QUEUED
        ]
        if not queued:
            return None
        queued.sort(key=lambda e: e.queue_position)
        return queued[0]

    async def has_active_item(self, *, agent_id: str) -> bool:
        return any(e.agent_id == agent_id and e.status in _ACTIVE_RUNTIME for e in self.entries)

    async def transition_status(
        self,
        *,
        entry_id: str,
        expected_status: AgentQueueStatus,
        new_status: AgentQueueStatus,
        updated_at: str,
    ) -> bool:
        for e in self.entries:
            if e.id == entry_id and e.status == expected_status:
                e.status = new_status
                e.updated_at = updated_at
                return True
        return False
