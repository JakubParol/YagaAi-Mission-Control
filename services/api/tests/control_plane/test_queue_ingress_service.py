import pytest

from app.control_plane.application.ports import NaomiQueueRepository
from app.control_plane.application.queue_ingress_service import NaomiQueueIngressService
from app.control_plane.domain.models import (
    NAOMI_AGENT_KEY,
    NaomiQueueEntry,
    NaomiQueueStatus,
)

_NAOMI_UUID = "8ce43dae-ae1b-4bdf-a7fa-dabea5e62eb6"
_OTHER_UUID = "aaaa0000-0000-0000-0000-000000000000"
_WORK_ITEM_ID = "wi-001"
_WORK_ITEM_KEY = "MC-100"


class FakeNaomiQueueRepo(NaomiQueueRepository):
    def __init__(self) -> None:
        self.entries: list[NaomiQueueEntry] = []

    async def enqueue(self, *, entry: NaomiQueueEntry) -> None:
        self.entries.append(entry)

    async def get_active_by_work_item(self, *, work_item_id: str) -> NaomiQueueEntry | None:
        for e in self.entries:
            if e.work_item_id == work_item_id and e.status in (
                NaomiQueueStatus.QUEUED,
                NaomiQueueStatus.DISPATCHING,
                NaomiQueueStatus.ACK_PENDING,
            ):
                return e
        return None

    async def cancel_by_work_item(self, *, work_item_id: str, cancelled_at: str) -> bool:
        found = False
        for e in self.entries:
            if e.work_item_id == work_item_id and e.status in (
                NaomiQueueStatus.QUEUED,
                NaomiQueueStatus.DISPATCHING,
                NaomiQueueStatus.ACK_PENDING,
            ):
                e.status = NaomiQueueStatus.CANCELLED
                e.cancelled_at = cancelled_at
                found = True
        return found

    async def next_queue_position(self, *, agent_id: str) -> int:
        positions = [
            e.queue_position
            for e in self.entries
            if e.agent_id == agent_id and e.status == NaomiQueueStatus.QUEUED
        ]
        return max(positions, default=0) + 1

    async def list_queued_by_agent(
        self,
        *,
        agent_id: str,
        status: NaomiQueueStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[NaomiQueueEntry], int]:
        filtered = [e for e in self.entries if e.agent_id == agent_id]
        if status is not None:
            filtered = [e for e in filtered if e.status == status]
        total = len(filtered)
        return filtered[offset : offset + limit], total


@pytest.mark.asyncio
async def test_eligible_story_assigned_to_naomi_is_enqueued() -> None:
    repo = FakeNaomiQueueRepo()
    svc = NaomiQueueIngressService(repo=repo)

    result = await svc.handle_assignment_changed(
        work_item_id=_WORK_ITEM_ID,
        work_item_key=_WORK_ITEM_KEY,
        work_item_type="STORY",
        work_item_status="TODO",
        agent_id=_NAOMI_UUID,
        previous_agent_id=None,
        agent_openclaw_key=NAOMI_AGENT_KEY,
        previous_agent_openclaw_key=None,
    )

    assert result.action == "enqueued"
    assert result.queue_entry_id is not None
    assert len(repo.entries) == 1
    assert repo.entries[0].status == NaomiQueueStatus.QUEUED
    assert repo.entries[0].work_item_key == _WORK_ITEM_KEY


@pytest.mark.asyncio
async def test_eligible_bug_assigned_to_naomi_is_enqueued() -> None:
    repo = FakeNaomiQueueRepo()
    svc = NaomiQueueIngressService(repo=repo)

    result = await svc.handle_assignment_changed(
        work_item_id=_WORK_ITEM_ID,
        work_item_key=_WORK_ITEM_KEY,
        work_item_type="BUG",
        work_item_status="TODO",
        agent_id=_NAOMI_UUID,
        previous_agent_id=None,
        agent_openclaw_key=NAOMI_AGENT_KEY,
        previous_agent_openclaw_key=None,
    )

    assert result.action == "enqueued"
    assert len(repo.entries) == 1


@pytest.mark.asyncio
async def test_duplicate_assignment_is_skipped() -> None:
    repo = FakeNaomiQueueRepo()
    svc = NaomiQueueIngressService(repo=repo)

    await svc.handle_assignment_changed(
        work_item_id=_WORK_ITEM_ID,
        work_item_key=_WORK_ITEM_KEY,
        work_item_type="STORY",
        work_item_status="TODO",
        agent_id=_NAOMI_UUID,
        previous_agent_id=None,
        agent_openclaw_key=NAOMI_AGENT_KEY,
        previous_agent_openclaw_key=None,
    )

    result = await svc.handle_assignment_changed(
        work_item_id=_WORK_ITEM_ID,
        work_item_key=_WORK_ITEM_KEY,
        work_item_type="STORY",
        work_item_status="TODO",
        agent_id=_NAOMI_UUID,
        previous_agent_id=None,
        agent_openclaw_key=NAOMI_AGENT_KEY,
        previous_agent_openclaw_key=None,
    )

    assert result.action == "skipped"
    assert result.reason == "already_queued"
    assert len(repo.entries) == 1


@pytest.mark.asyncio
async def test_unassign_from_naomi_cancels_queued_entry() -> None:
    repo = FakeNaomiQueueRepo()
    svc = NaomiQueueIngressService(repo=repo)

    await svc.handle_assignment_changed(
        work_item_id=_WORK_ITEM_ID,
        work_item_key=_WORK_ITEM_KEY,
        work_item_type="STORY",
        work_item_status="TODO",
        agent_id=_NAOMI_UUID,
        previous_agent_id=None,
        agent_openclaw_key=NAOMI_AGENT_KEY,
        previous_agent_openclaw_key=None,
    )
    assert repo.entries[0].status == NaomiQueueStatus.QUEUED

    result = await svc.handle_assignment_changed(
        work_item_id=_WORK_ITEM_ID,
        work_item_key=_WORK_ITEM_KEY,
        work_item_type="STORY",
        work_item_status="TODO",
        agent_id=_OTHER_UUID,
        previous_agent_id=_NAOMI_UUID,
        agent_openclaw_key="other",
        previous_agent_openclaw_key=NAOMI_AGENT_KEY,
    )

    assert result.action == "cancelled"
    assert repo.entries[0].status == NaomiQueueStatus.CANCELLED


@pytest.mark.asyncio
async def test_non_naomi_assignment_is_skipped() -> None:
    repo = FakeNaomiQueueRepo()
    svc = NaomiQueueIngressService(repo=repo)

    result = await svc.handle_assignment_changed(
        work_item_id=_WORK_ITEM_ID,
        work_item_key=_WORK_ITEM_KEY,
        work_item_type="STORY",
        work_item_status="TODO",
        agent_id=_OTHER_UUID,
        previous_agent_id=None,
        agent_openclaw_key="james",
        previous_agent_openclaw_key=None,
    )

    assert result.action == "skipped"
    assert result.reason == "not_naomi"
    assert len(repo.entries) == 0


@pytest.mark.asyncio
async def test_ineligible_type_is_skipped() -> None:
    repo = FakeNaomiQueueRepo()
    svc = NaomiQueueIngressService(repo=repo)

    for item_type in ("EPIC", "TASK"):
        result = await svc.handle_assignment_changed(
            work_item_id=_WORK_ITEM_ID,
            work_item_key=_WORK_ITEM_KEY,
            work_item_type=item_type,
            work_item_status="TODO",
            agent_id=_NAOMI_UUID,
            previous_agent_id=None,
            agent_openclaw_key=NAOMI_AGENT_KEY,
            previous_agent_openclaw_key=None,
        )
        assert result.action == "skipped"
        assert result.reason == "not_eligible"

    assert len(repo.entries) == 0


@pytest.mark.asyncio
async def test_ineligible_status_is_skipped() -> None:
    repo = FakeNaomiQueueRepo()
    svc = NaomiQueueIngressService(repo=repo)

    for status in ("IN_PROGRESS", "CODE_REVIEW", "DONE"):
        result = await svc.handle_assignment_changed(
            work_item_id=_WORK_ITEM_ID,
            work_item_key=_WORK_ITEM_KEY,
            work_item_type="STORY",
            work_item_status=status,
            agent_id=_NAOMI_UUID,
            previous_agent_id=None,
            agent_openclaw_key=NAOMI_AGENT_KEY,
            previous_agent_openclaw_key=None,
        )
        assert result.action == "skipped"
        assert result.reason == "not_eligible"

    assert len(repo.entries) == 0


@pytest.mark.asyncio
async def test_missing_agent_id_is_skipped() -> None:
    repo = FakeNaomiQueueRepo()
    svc = NaomiQueueIngressService(repo=repo)

    result = await svc.handle_assignment_changed(
        work_item_id=_WORK_ITEM_ID,
        work_item_key=_WORK_ITEM_KEY,
        work_item_type="STORY",
        work_item_status="TODO",
        agent_id=None,
        previous_agent_id=None,
        agent_openclaw_key=NAOMI_AGENT_KEY,
        previous_agent_openclaw_key=None,
    )

    assert result.action == "skipped"
    assert result.reason == "missing_agent_id"
    assert len(repo.entries) == 0


@pytest.mark.asyncio
async def test_queue_position_increments() -> None:
    repo = FakeNaomiQueueRepo()
    svc = NaomiQueueIngressService(repo=repo)

    for i, wi_id in enumerate(["wi-1", "wi-2", "wi-3"]):
        await svc.handle_assignment_changed(
            work_item_id=wi_id,
            work_item_key=f"MC-{100 + i}",
            work_item_type="STORY",
            work_item_status="TODO",
            agent_id=_NAOMI_UUID,
            previous_agent_id=None,
            agent_openclaw_key=NAOMI_AGENT_KEY,
            previous_agent_openclaw_key=None,
        )

    positions = [e.queue_position for e in repo.entries]
    assert positions == [1, 2, 3]
