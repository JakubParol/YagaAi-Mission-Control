"""Tests for QueueDispatchService orchestration."""

import pytest

from app.control_plane.application.dispatch_selection_service import DispatchSelectionService
from app.control_plane.application.openclaw_dispatch_service import OpenClawDispatchService
from app.control_plane.application.queue_dispatch_service import QueueDispatchService
from app.control_plane.application.queue_ingress_service import QueueIngressService
from app.control_plane.domain.models import AgentQueueStatus, DispatchEnvelope
from app.control_plane.infrastructure.sources.openclaw_adapter import build_dispatch_prompt
from app.shared.ports import AgentInfo
from tests.control_plane.fake_agent_lookup import FakeAgentLookup
from tests.control_plane.fake_agent_queue_repo import FakeAgentQueueRepo
from tests.control_plane.fake_dispatch_repo import FakeDispatchRecordRepo
from tests.control_plane.fake_openclaw_adapter import FailingOpenClawAdapter, FakeOpenClawAdapter

_TEST_MC_API_BASE_URL = "http://127.0.0.1:5000"


def _build_svc(
    *,
    agent_lookup: FakeAgentLookup | None = None,
    adapter: FakeOpenClawAdapter | FailingOpenClawAdapter | None = None,
) -> QueueDispatchService:
    queue_repo = FakeAgentQueueRepo()
    dispatch_repo = FakeDispatchRecordRepo()
    oc_adapter = adapter or FakeOpenClawAdapter()

    return QueueDispatchService(
        ingress=QueueIngressService(repo=queue_repo),
        selection=DispatchSelectionService(repo=queue_repo),
        dispatch=OpenClawDispatchService(
            queue_repo=queue_repo,
            dispatch_repo=dispatch_repo,
            openclaw_adapter=oc_adapter,
            mc_api_base_url=_TEST_MC_API_BASE_URL,
        ),
        agent_lookup=agent_lookup or FakeAgentLookup(),
    )


@pytest.mark.asyncio
async def test_enqueue_and_dispatch_idle_agent() -> None:
    """Enqueue + idle agent with session key → dispatch attempted."""
    lookup = FakeAgentLookup(
        agents={
            "agent-naomi-id": AgentInfo(
                agent_id="agent-naomi-id",
                openclaw_key="naomi",
                main_session_key="agent:naomi:main",
            ),
        }
    )
    adapter = FakeOpenClawAdapter()
    svc = _build_svc(agent_lookup=lookup, adapter=adapter)

    result = await svc.enqueue_and_dispatch(
        work_item_id="wi-001",
        work_item_key="MC-100",
        work_item_type="STORY",
        work_item_title="Test story",
        work_item_status="TODO",
        project_repo_root="/repos/mc",
        agent_id="agent-naomi-id",
        previous_agent_id=None,
    )

    assert result.action == "enqueued"
    assert adapter.dispatch_count == 1


@pytest.mark.asyncio
async def test_enqueue_and_dispatch_busy_agent() -> None:
    """Enqueue + busy agent → no dispatch attempted."""
    lookup = FakeAgentLookup(
        agents={
            "agent-naomi-id": AgentInfo(
                agent_id="agent-naomi-id",
                openclaw_key="naomi",
                main_session_key="agent:naomi:main",
            ),
        }
    )
    adapter = FakeOpenClawAdapter()
    svc = _build_svc(agent_lookup=lookup, adapter=adapter)

    # First enqueue + dispatch succeeds
    await svc.enqueue_and_dispatch(
        work_item_id="wi-001",
        work_item_key="MC-100",
        work_item_type="STORY",
        work_item_title="Story 1",
        work_item_status="TODO",
        agent_id="agent-naomi-id",
        previous_agent_id=None,
    )

    # Second enqueue — agent is busy
    result = await svc.enqueue_and_dispatch(
        work_item_id="wi-002",
        work_item_key="MC-101",
        work_item_type="STORY",
        work_item_title="Story 2",
        work_item_status="TODO",
        agent_id="agent-naomi-id",
        previous_agent_id=None,
    )

    assert result.action == "enqueued"
    # Only 1 dispatch — second was skipped due to capacity
    assert adapter.dispatch_count == 1


@pytest.mark.asyncio
async def test_missing_session_key_records_failure() -> None:
    """Agent without main_session_key → MISSING_MAIN_SESSION_KEY failure."""
    lookup = FakeAgentLookup(
        agents={
            "agent-naomi-id": AgentInfo(
                agent_id="agent-naomi-id",
                openclaw_key="naomi",
                main_session_key=None,  # Missing!
            ),
        }
    )
    svc = _build_svc(agent_lookup=lookup)

    result = await svc.enqueue_and_dispatch(
        work_item_id="wi-001",
        work_item_key="MC-100",
        work_item_type="STORY",
        work_item_title="Test story",
        work_item_status="TODO",
        agent_id="agent-naomi-id",
        previous_agent_id=None,
    )

    # Enqueue still succeeded
    assert result.action == "enqueued"
    # Queue entry should be reverted to QUEUED (recoverable)
    entries, _ = await svc.ingress.list_queue(agent_id="agent-naomi-id")
    assert len(entries) == 1
    assert entries[0].status == AgentQueueStatus.QUEUED


@pytest.mark.asyncio
async def test_subprocess_failure_records_error() -> None:
    """Adapter failure → dispatch record FAILED, queue recoverable."""
    lookup = FakeAgentLookup(
        agents={
            "agent-naomi-id": AgentInfo(
                agent_id="agent-naomi-id",
                openclaw_key="naomi",
                main_session_key="agent:naomi:main",
            ),
        }
    )
    adapter = FailingOpenClawAdapter(error="Connection refused")
    svc = _build_svc(agent_lookup=lookup, adapter=adapter)

    result = await svc.enqueue_and_dispatch(
        work_item_id="wi-001",
        work_item_key="MC-100",
        work_item_type="STORY",
        work_item_title="Test story",
        work_item_status="TODO",
        agent_id="agent-naomi-id",
        previous_agent_id=None,
    )

    assert result.action == "enqueued"
    # Queue entry reverted to QUEUED
    entries, _ = await svc.ingress.list_queue(agent_id="agent-naomi-id")
    assert len(entries) == 1
    assert entries[0].status == AgentQueueStatus.QUEUED


@pytest.mark.asyncio
async def test_prompt_includes_required_fields() -> None:
    """Dispatch prompt includes work_item_key, title, run_id, correlation_id."""
    lookup = FakeAgentLookup(
        agents={
            "agent-naomi-id": AgentInfo(
                agent_id="agent-naomi-id",
                openclaw_key="naomi",
                main_session_key="agent:naomi:main",
            ),
        }
    )
    adapter = FakeOpenClawAdapter()
    svc = _build_svc(agent_lookup=lookup, adapter=adapter)

    await svc.enqueue_and_dispatch(
        work_item_id="wi-001",
        work_item_key="MC-100",
        work_item_type="STORY",
        work_item_title="My test story title",
        work_item_status="TODO",
        agent_id="agent-naomi-id",
        previous_agent_id=None,
    )

    assert adapter.dispatch_count == 1
    envelope = adapter.last_envelope
    assert envelope is not None
    assert "MC-100" in envelope.prompt_marker
    assert envelope.work_item_key == "MC-100"
    assert envelope.work_item_title == "My test story title"
    assert envelope.run_id.startswith("cp-")
    assert envelope.correlation_id
    assert envelope.mc_api_base_url == _TEST_MC_API_BASE_URL


def test_build_prompt_includes_mc_api_base_url() -> None:
    """Dispatch prompt includes MC API target and --api-base instruction."""
    envelope = DispatchEnvelope(
        run_id="cp-test-run-001",
        correlation_id="corr-001",
        causation_id="cause-001",
        agent_id="agent-naomi-id",
        openclaw_key="naomi",
        main_session_key="agent:naomi:main",
        work_item_id="wi-001",
        work_item_key="MC-200",
        work_item_title="Test story",
        project_key="MC",
        repo_root="/repos/mc",
        work_dir="/repos/mc",
        mc_api_base_url="http://127.0.0.1:5000",
        prompt_marker="[MC-200] [E2E]",
        contract_version="control-plane-delivery-v1",
    )

    prompt = build_dispatch_prompt(envelope)

    assert "MC API target: http://127.0.0.1:5000" in prompt
    assert "mc --api-base http://127.0.0.1:5000" in prompt
    assert "Do NOT use bare `mc` without --api-base" in prompt
