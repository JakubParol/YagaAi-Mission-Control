import pytest

from app.control_plane.application.watchdog_service import WatchdogService
from app.control_plane.application.worker_state_machine_service import WorkerStateMachineService
from app.control_plane.domain.models import RunStatus
from app.control_plane.infrastructure.repositories.consumer import DbConsumerRepository
from app.control_plane.infrastructure.repositories.run import DbRunRepository
from app.shared.db.session import get_session_factory

_STREAM = "mc:control-plane:events:control_plane_run_submit_accepted:v1:p0"
_GROUP = "control-plane-workers-v1"
_CONSUMER = "worker-a"


async def _process(
    service: WorkerStateMachineService,
    *,
    message_id: str,
    run_id: str,
    event_type: str,
    payload: dict[str, str] | None = None,
    occurred_at: str,
) -> dict[str, str]:
    return await service.process_message(
        stream_key=_STREAM,
        consumer_group=_GROUP,
        consumer_name=_CONSUMER,
        message_id=message_id,
        run_id=run_id,
        event_type=event_type,
        correlation_id=f"corr-{run_id}",
        causation_id="cause-1",
        occurred_at=occurred_at,
        payload=payload or {},
    )


@pytest.mark.asyncio
async def test_watchdog_detects_heartbeat_loss_and_schedules_retry() -> None:
    async with get_session_factory()() as session:
        run_repo = DbRunRepository(session)
        consumer_repo = DbConsumerRepository(session)
        worker = WorkerStateMachineService(run_repo=run_repo, consumer_repo=consumer_repo)
        watchdog = WatchdogService(repo=run_repo)

        await _process(
            worker,
            message_id="1710000000000-0",
            run_id="run-watchdog-1",
            event_type="control-plane.run.submit.accepted",
            payload={"run_type": "DEFAULT"},
            occurred_at="2026-03-08T12:00:00Z",
        )
        await _process(
            worker,
            message_id="1710000000000-1",
            run_id="run-watchdog-1",
            event_type="control-plane.run.started",
            payload={"lease_owner": "worker-a", "lease_token": "lease-1"},
            occurred_at="2026-03-08T12:00:01Z",
        )

        decisions = await watchdog.evaluate_stale_runs(
            watchdog_instance="watchdog-a",
            evaluated_at="2026-03-08T12:05:00Z",
        )
        run = await run_repo.get_run(run_id="run-watchdog-1")

    assert decisions and decisions[0]["action"] == "RETRY"
    assert run is not None
    assert run.status.value == "PENDING"
    assert run.watchdog_state == "RETRY_SCHEDULED"


@pytest.mark.asyncio
async def test_watchdog_applies_quarantine_for_batch_second_violation() -> None:
    async with get_session_factory()() as session:
        run_repo = DbRunRepository(session)
        consumer_repo = DbConsumerRepository(session)
        worker = WorkerStateMachineService(run_repo=run_repo, consumer_repo=consumer_repo)
        watchdog = WatchdogService(repo=run_repo)

        await _process(
            worker,
            message_id="1710000001000-0",
            run_id="run-watchdog-2",
            event_type="control-plane.run.submit.accepted",
            payload={"run_type": "BATCH"},
            occurred_at="2026-03-08T12:00:00Z",
        )
        await _process(
            worker,
            message_id="1710000001000-1",
            run_id="run-watchdog-2",
            event_type="control-plane.run.started",
            payload={"lease_owner": "worker-a", "lease_token": "lease-2"},
            occurred_at="2026-03-08T12:00:01Z",
        )
        first_decision = await watchdog.evaluate_stale_runs(
            watchdog_instance="watchdog-a",
            evaluated_at="2026-03-08T12:05:00Z",
        )

        await _process(
            worker,
            message_id="1710000001000-2",
            run_id="run-watchdog-2",
            event_type="control-plane.run.started",
            payload={"lease_owner": "worker-a", "lease_token": "lease-2b"},
            occurred_at="2026-03-08T12:05:01Z",
        )
        second_decision = await watchdog.evaluate_stale_runs(
            watchdog_instance="watchdog-a",
            evaluated_at="2026-03-08T12:10:00Z",
        )
        run = await run_repo.get_run(run_id="run-watchdog-2")

    assert first_decision and first_decision[0]["action"] == "RETRY"
    assert second_decision and second_decision[0]["action"] == "QUARANTINE"
    assert run is not None
    assert run.status.value == "FAILED"
    assert run.watchdog_state == "QUARANTINED"


@pytest.mark.asyncio
async def test_watchdog_fails_critical_run_on_timeout() -> None:
    async with get_session_factory()() as session:
        run_repo = DbRunRepository(session)
        consumer_repo = DbConsumerRepository(session)
        worker = WorkerStateMachineService(run_repo=run_repo, consumer_repo=consumer_repo)
        watchdog = WatchdogService(repo=run_repo)

        await _process(
            worker,
            message_id="1710000002000-0",
            run_id="run-watchdog-3",
            event_type="control-plane.run.submit.accepted",
            payload={"run_type": "CRITICAL"},
            occurred_at="2026-03-08T12:00:00Z",
        )
        await _process(
            worker,
            message_id="1710000002000-1",
            run_id="run-watchdog-3",
            event_type="control-plane.run.started",
            payload={"lease_owner": "worker-a", "lease_token": "lease-3"},
            occurred_at="2026-03-08T12:00:01Z",
        )
        decisions = await watchdog.evaluate_stale_runs(
            watchdog_instance="watchdog-a",
            evaluated_at="2026-03-08T12:20:00Z",
        )
        run = await run_repo.get_run(run_id="run-watchdog-3")

    assert decisions and decisions[0]["action"] == "FAIL"
    assert run is not None
    assert run.status == RunStatus.FAILED


@pytest.mark.asyncio
async def test_compare_and_set_run_lease_prevents_conflicting_mutation() -> None:
    async with get_session_factory()() as session:
        run_repo = DbRunRepository(session)
        consumer_repo = DbConsumerRepository(session)
        worker = WorkerStateMachineService(run_repo=run_repo, consumer_repo=consumer_repo)

        await _process(
            worker,
            message_id="1710000003000-0",
            run_id="run-watchdog-4",
            event_type="control-plane.run.submit.accepted",
            payload={"run_type": "DEFAULT"},
            occurred_at="2026-03-08T12:00:00Z",
        )
        await _process(
            worker,
            message_id="1710000003000-1",
            run_id="run-watchdog-4",
            event_type="control-plane.run.started",
            payload={"lease_owner": "worker-a", "lease_token": "lease-4"},
            occurred_at="2026-03-08T12:00:01Z",
        )

        updated = await run_repo.compare_and_set_run_lease(
            run_id="run-watchdog-4",
            expected_lease_token="wrong-lease-token",
            lease_owner="worker-b",
            new_lease_token="lease-4b",
            heartbeat_at="2026-03-08T12:01:00Z",
            timeout_at="2026-03-08T12:02:00Z",
            updated_at="2026-03-08T12:01:00Z",
        )
        run = await run_repo.get_run(run_id="run-watchdog-4")

    assert updated is False
    assert run is not None
    assert run.lease_owner == "worker-a"
    assert run.lease_token == "lease-4"
