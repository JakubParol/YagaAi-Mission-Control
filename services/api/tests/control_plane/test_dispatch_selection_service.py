import pytest

from app.control_plane.application.dispatch_selection_service import (
    DispatchSelectionService,
)
from app.control_plane.application.ports import AgentQueueRepository
from app.control_plane.domain.models import AgentQueueEntry, AgentQueueStatus

_AGENT = "agent-naomi-001"
_OTHER_AGENT = "agent-amos-001"


class FakeAgentQueueRepo(AgentQueueRepository):
    """In-memory fake that implements the full AgentQueueRepository port."""

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
        return any(
            e.agent_id == agent_id and e.status in self._ACTIVE_RUNTIME for e in self.entries
        )

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


def _make_entry(
    entry_id: str,
    *,
    agent_id: str = _AGENT,
    work_item_id: str = "wi-001",
    work_item_key: str = "MC-100",
    status: AgentQueueStatus = AgentQueueStatus.QUEUED,
    queue_position: int = 1,
) -> AgentQueueEntry:
    return AgentQueueEntry(
        id=entry_id,
        work_item_id=work_item_id,
        work_item_key=work_item_key,
        work_item_type="STORY",
        agent_id=agent_id,
        status=status,
        queue_position=queue_position,
        correlation_id="corr-001",
        causation_id=None,
        enqueued_at="2026-03-23T10:00:00Z",
        updated_at="2026-03-23T10:00:00Z",
    )


# --- Acceptance criterion 1: idle agent gets oldest queued item ---


@pytest.mark.asyncio
async def test_idle_agent_gets_oldest_queued_item() -> None:
    repo = FakeAgentQueueRepo()
    repo.entries = [
        _make_entry("e-1", work_item_id="wi-1", work_item_key="MC-101", queue_position=1),
        _make_entry("e-2", work_item_id="wi-2", work_item_key="MC-102", queue_position=2),
        _make_entry("e-3", work_item_id="wi-3", work_item_key="MC-103", queue_position=3),
    ]
    svc = DispatchSelectionService(repo=repo)

    result = await svc.try_dispatch_next(agent_id=_AGENT)

    assert result.action == "dispatched"
    assert result.entry is not None
    assert result.entry.work_item_key == "MC-101"


# --- Acceptance criterion 2: busy agent does not get another dispatch ---


@pytest.mark.asyncio
async def test_busy_agent_does_not_get_dispatch() -> None:
    repo = FakeAgentQueueRepo()
    repo.entries = [
        _make_entry(
            "e-active",
            work_item_id="wi-active",
            work_item_key="MC-200",
            status=AgentQueueStatus.EXECUTING,
            queue_position=0,
        ),
        _make_entry("e-queued", work_item_id="wi-queued", work_item_key="MC-201", queue_position=1),
    ]
    svc = DispatchSelectionService(repo=repo)

    result = await svc.try_dispatch_next(agent_id=_AGENT)

    assert result.action == "skipped"
    assert result.reason == "agent_busy"
    # Queued item remains QUEUED
    assert repo.entries[1].status == AgentQueueStatus.QUEUED


@pytest.mark.asyncio
async def test_dispatching_status_counts_as_busy() -> None:
    repo = FakeAgentQueueRepo()
    repo.entries = [
        _make_entry(
            "e-disp",
            work_item_id="wi-disp",
            work_item_key="MC-300",
            status=AgentQueueStatus.DISPATCHING,
            queue_position=0,
        ),
        _make_entry("e-queued", work_item_id="wi-q", work_item_key="MC-301", queue_position=1),
    ]
    svc = DispatchSelectionService(repo=repo)

    result = await svc.try_dispatch_next(agent_id=_AGENT)

    assert result.action == "skipped"
    assert result.reason == "agent_busy"


@pytest.mark.asyncio
async def test_ack_pending_counts_as_busy() -> None:
    repo = FakeAgentQueueRepo()
    repo.entries = [
        _make_entry(
            "e-ack",
            work_item_id="wi-ack",
            work_item_key="MC-400",
            status=AgentQueueStatus.ACK_PENDING,
            queue_position=0,
        ),
        _make_entry("e-queued", work_item_id="wi-q", work_item_key="MC-401", queue_position=1),
    ]
    svc = DispatchSelectionService(repo=repo)

    result = await svc.try_dispatch_next(agent_id=_AGENT)

    assert result.action == "skipped"
    assert result.reason == "agent_busy"


# --- Acceptance criterion 3: FIFO ordering ---


@pytest.mark.asyncio
async def test_fifo_selects_lowest_queue_position() -> None:
    repo = FakeAgentQueueRepo()
    repo.entries = [
        _make_entry("e-3", work_item_id="wi-3", work_item_key="MC-103", queue_position=3),
        _make_entry("e-1", work_item_id="wi-1", work_item_key="MC-101", queue_position=1),
        _make_entry("e-2", work_item_id="wi-2", work_item_key="MC-102", queue_position=2),
    ]
    svc = DispatchSelectionService(repo=repo)

    result = await svc.try_dispatch_next(agent_id=_AGENT)

    assert result.action == "dispatched"
    assert result.entry is not None
    assert result.entry.work_item_key == "MC-101"


# --- Acceptance criterion 4: state transitions are persisted ---


@pytest.mark.asyncio
async def test_dispatch_transitions_to_ack_pending() -> None:
    repo = FakeAgentQueueRepo()
    repo.entries = [
        _make_entry("e-1", work_item_id="wi-1", work_item_key="MC-101", queue_position=1),
    ]
    svc = DispatchSelectionService(repo=repo)

    result = await svc.try_dispatch_next(agent_id=_AGENT)

    assert result.action == "dispatched"
    # Entry should now be ACK_PENDING (went through QUEUED→DISPATCHING→ACK_PENDING)
    entry = repo.entries[0]
    assert entry.status == AgentQueueStatus.ACK_PENDING


# --- Acceptance criterion 5: idempotent re-run ---


@pytest.mark.asyncio
async def test_idempotent_second_dispatch_is_skipped() -> None:
    repo = FakeAgentQueueRepo()
    repo.entries = [
        _make_entry("e-1", work_item_id="wi-1", work_item_key="MC-101", queue_position=1),
    ]
    svc = DispatchSelectionService(repo=repo)

    first = await svc.try_dispatch_next(agent_id=_AGENT)
    assert first.action == "dispatched"

    # Second call: agent is now busy with the ACK_PENDING item
    second = await svc.try_dispatch_next(agent_id=_AGENT)
    assert second.action == "skipped"
    assert second.reason == "agent_busy"


@pytest.mark.asyncio
async def test_dispatch_on_empty_queue() -> None:
    repo = FakeAgentQueueRepo()
    svc = DispatchSelectionService(repo=repo)

    result = await svc.try_dispatch_next(agent_id=_AGENT)

    assert result.action == "skipped"
    assert result.reason == "queue_empty"


@pytest.mark.asyncio
async def test_dispatch_isolates_agents() -> None:
    """Dispatch for one agent does not affect another agent's queue."""
    repo = FakeAgentQueueRepo()
    repo.entries = [
        _make_entry(
            "e-other",
            agent_id=_OTHER_AGENT,
            work_item_id="wi-other",
            work_item_key="MC-500",
            status=AgentQueueStatus.EXECUTING,
            queue_position=0,
        ),
        _make_entry("e-mine", work_item_id="wi-mine", work_item_key="MC-501", queue_position=1),
    ]
    svc = DispatchSelectionService(repo=repo)

    # Other agent is busy, but our agent is idle
    result = await svc.try_dispatch_next(agent_id=_AGENT)

    assert result.action == "dispatched"
    assert result.entry is not None
    assert result.entry.work_item_key == "MC-501"


# --- Agent queue summary ---


@pytest.mark.asyncio
async def test_summary_idle_agent() -> None:
    repo = FakeAgentQueueRepo()
    repo.entries = [
        _make_entry("e-1", work_item_id="wi-1", work_item_key="MC-101", queue_position=1),
        _make_entry("e-2", work_item_id="wi-2", work_item_key="MC-102", queue_position=2),
    ]
    svc = DispatchSelectionService(repo=repo)

    summary = await svc.get_agent_queue_summary(agent_id=_AGENT)

    assert summary.has_active_item is False
    assert summary.active_entry is None
    assert summary.queued_count == 2
    assert len(summary.queued_entries) == 2


@pytest.mark.asyncio
async def test_summary_busy_agent() -> None:
    repo = FakeAgentQueueRepo()
    repo.entries = [
        _make_entry(
            "e-active",
            work_item_id="wi-active",
            work_item_key="MC-200",
            status=AgentQueueStatus.EXECUTING,
            queue_position=0,
        ),
        _make_entry("e-queued", work_item_id="wi-q1", work_item_key="MC-201", queue_position=1),
    ]
    svc = DispatchSelectionService(repo=repo)

    summary = await svc.get_agent_queue_summary(agent_id=_AGENT)

    assert summary.has_active_item is True
    assert summary.active_entry is not None
    assert summary.active_entry.work_item_key == "MC-200"
    assert summary.queued_count == 1


@pytest.mark.asyncio
async def test_summary_empty_queue() -> None:
    repo = FakeAgentQueueRepo()
    svc = DispatchSelectionService(repo=repo)

    summary = await svc.get_agent_queue_summary(agent_id=_AGENT)

    assert summary.has_active_item is False
    assert summary.active_entry is None
    assert summary.queued_count == 0
    assert summary.queued_entries == []
