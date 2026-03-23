import pytest

from app.control_plane.application.queue_ingress_service import QueueIngressService
from app.control_plane.domain.models import AgentQueueStatus
from tests.control_plane.fake_agent_queue_repo import FakeAgentQueueRepo

_AGENT_A = "agent-aaa-0000"
_AGENT_B = "agent-bbb-0000"
_WORK_ITEM_ID = "wi-001"
_WORK_ITEM_KEY = "MC-100"


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
