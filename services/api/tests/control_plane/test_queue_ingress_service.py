import pytest

from app.control_plane.application.ports import AgentQueueRepository
from app.control_plane.application.queue_ingress_service import QueueIngressService
from app.control_plane.domain.models import AgentQueueEntry, AgentQueueStatus

_AGENT_A = "agent-aaa-0000"
_AGENT_B = "agent-bbb-0000"
_WORK_ITEM_ID = "wi-001"
_WORK_ITEM_KEY = "MC-100"


class FakeAgentQueueRepo(AgentQueueRepository):
    def __init__(self) -> None:
        self.entries: list[AgentQueueEntry] = []

    async def enqueue(self, *, entry: AgentQueueEntry) -> None:
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
        total = len(filtered)
        return filtered[offset : offset + limit], total

    async def get_oldest_queued_for_agent(self, *, agent_id: str) -> AgentQueueEntry | None:
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
            e.agent_id == agent_id
            and e.status
            in (
                AgentQueueStatus.DISPATCHING,
                AgentQueueStatus.ACK_PENDING,
                AgentQueueStatus.PLANNING,
                AgentQueueStatus.EXECUTING,
                AgentQueueStatus.BLOCKED,
                AgentQueueStatus.REVIEW_READY,
            )
            for e in self.entries
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


async def _assign(
    svc: QueueIngressService,
    *,
    work_item_id: str = _WORK_ITEM_ID,
    work_item_key: str = _WORK_ITEM_KEY,
    work_item_type: str = "STORY",
    work_item_status: str = "TODO",
    agent_id: str | None = _AGENT_A,
    previous_agent_id: str | None = None,
):
    return await svc.handle_assignment_changed(
        work_item_id=work_item_id,
        work_item_key=work_item_key,
        work_item_type=work_item_type,
        work_item_status=work_item_status,
        agent_id=agent_id,
        previous_agent_id=previous_agent_id,
    )


@pytest.mark.asyncio
async def test_eligible_story_is_enqueued() -> None:
    repo = FakeAgentQueueRepo()
    svc = QueueIngressService(repo=repo)

    result = await _assign(svc)

    assert result.action == "enqueued"
    assert result.queue_entry_id is not None
    assert len(repo.entries) == 1
    assert repo.entries[0].status == AgentQueueStatus.QUEUED
    assert repo.entries[0].work_item_key == _WORK_ITEM_KEY


@pytest.mark.asyncio
async def test_eligible_bug_is_enqueued() -> None:
    repo = FakeAgentQueueRepo()
    svc = QueueIngressService(repo=repo)

    result = await _assign(svc, work_item_type="BUG")

    assert result.action == "enqueued"
    assert len(repo.entries) == 1


@pytest.mark.asyncio
async def test_duplicate_assignment_is_skipped() -> None:
    repo = FakeAgentQueueRepo()
    svc = QueueIngressService(repo=repo)

    await _assign(svc)
    result = await _assign(svc)

    assert result.action == "skipped"
    assert result.reason == "already_queued"
    assert len(repo.entries) == 1


@pytest.mark.asyncio
async def test_reassign_cancels_queued_entry() -> None:
    repo = FakeAgentQueueRepo()
    svc = QueueIngressService(repo=repo)

    await _assign(svc, agent_id=_AGENT_A)
    assert repo.entries[0].status == AgentQueueStatus.QUEUED

    result = await _assign(svc, agent_id=_AGENT_B, previous_agent_id=_AGENT_A)

    # Old entry cancelled, new one enqueued for agent B
    assert repo.entries[0].status == AgentQueueStatus.CANCELLED
    assert result.action == "enqueued"
    assert len(repo.entries) == 2


@pytest.mark.asyncio
async def test_unassign_cancels_queued_entry() -> None:
    repo = FakeAgentQueueRepo()
    svc = QueueIngressService(repo=repo)

    await _assign(svc, agent_id=_AGENT_A)

    result = await _assign(svc, agent_id=None, previous_agent_id=_AGENT_A)

    assert result.action == "skipped"
    assert result.reason == "unassigned"
    assert repo.entries[0].status == AgentQueueStatus.CANCELLED


@pytest.mark.asyncio
async def test_any_agent_is_eligible() -> None:
    repo = FakeAgentQueueRepo()
    svc = QueueIngressService(repo=repo)

    for agent in [_AGENT_A, _AGENT_B, "agent-ccc"]:
        result = await _assign(
            svc,
            work_item_id=f"wi-{agent}",
            agent_id=agent,
        )
        assert result.action == "enqueued"

    assert len(repo.entries) == 3


@pytest.mark.asyncio
async def test_ineligible_type_is_skipped() -> None:
    repo = FakeAgentQueueRepo()
    svc = QueueIngressService(repo=repo)

    for item_type in ("EPIC", "TASK"):
        result = await _assign(svc, work_item_type=item_type)
        assert result.action == "skipped"
        assert result.reason == "not_eligible"

    assert len(repo.entries) == 0


@pytest.mark.asyncio
async def test_ineligible_status_is_skipped() -> None:
    repo = FakeAgentQueueRepo()
    svc = QueueIngressService(repo=repo)

    for status in ("IN_PROGRESS", "CODE_REVIEW", "DONE"):
        result = await _assign(svc, work_item_status=status)
        assert result.action == "skipped"
        assert result.reason == "not_eligible"

    assert len(repo.entries) == 0


@pytest.mark.asyncio
async def test_missing_agent_id_is_skipped() -> None:
    repo = FakeAgentQueueRepo()
    svc = QueueIngressService(repo=repo)

    result = await _assign(svc, agent_id=None)

    assert result.action == "skipped"
    assert result.reason == "unassigned"
    assert len(repo.entries) == 0


@pytest.mark.asyncio
async def test_multiple_items_enqueue_independently() -> None:
    repo = FakeAgentQueueRepo()
    svc = QueueIngressService(repo=repo)

    for i, wi_id in enumerate(["wi-1", "wi-2", "wi-3"]):
        result = await _assign(svc, work_item_id=wi_id, work_item_key=f"MC-{100 + i}")
        assert result.action == "enqueued"

    assert len(repo.entries) == 3
    work_item_ids = [e.work_item_id for e in repo.entries]
    assert work_item_ids == ["wi-1", "wi-2", "wi-3"]
