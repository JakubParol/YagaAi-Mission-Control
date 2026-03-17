import pytest
from sqlalchemy import text

from app.control_plane.application.worker_state_machine_service import WorkerStateMachineService
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
    occurred_at: str = "2026-03-08T12:00:00Z",
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
async def test_worker_state_machine_happy_path_reaches_terminal_run() -> None:
    async with get_session_factory()() as session:
        run_repo = DbRunRepository(session)
        consumer_repo = DbConsumerRepository(session)
        service = WorkerStateMachineService(run_repo=run_repo, consumer_repo=consumer_repo)

        await _process(
            service,
            message_id="1710000000000-0",
            run_id="run-1",
            event_type="control-plane.run.submit.accepted",
            payload={"run_type": "BATCH"},
        )
        await _process(
            service,
            message_id="1710000000000-1",
            run_id="run-1",
            event_type="control-plane.run.started",
            payload={"lease_owner": "worker-a", "lease_token": "lease-abc"},
        )
        await _process(
            service,
            message_id="1710000000000-2",
            run_id="run-1",
            event_type="control-plane.step.started",
            payload={"step_id": "step-1"},
        )
        await _process(
            service,
            message_id="1710000000000-3",
            run_id="run-1",
            event_type="control-plane.step.succeeded",
            payload={"step_id": "step-1"},
        )
        await _process(
            service,
            message_id="1710000000000-4",
            run_id="run-1",
            event_type="control-plane.run.succeeded",
        )

        run = await run_repo.get_run(run_id="run-1")
        step = await run_repo.get_step(run_id="run-1", step_id="step-1")
        result = await session.execute(
            text("SELECT COUNT(1) FROM control_plane_run_timeline WHERE run_id = :rid"),
            {"rid": "run-1"},
        )
        timeline_row = result.first()
        assert timeline_row is not None
        timeline_count = int(timeline_row[0])

    assert run is not None
    assert run.status.value == "SUCCEEDED"
    assert run.run_type == "BATCH"
    assert run.terminal_at is not None
    assert run.lease_token is None
    assert step is not None
    assert step.status.value == "SUCCEEDED"
    assert timeline_count == 5


@pytest.mark.asyncio
async def test_worker_state_machine_rejects_illegal_transition_without_state_corruption() -> None:
    async with get_session_factory()() as session:
        run_repo = DbRunRepository(session)
        consumer_repo = DbConsumerRepository(session)
        service = WorkerStateMachineService(run_repo=run_repo, consumer_repo=consumer_repo)

        await _process(
            service,
            message_id="1710000001000-0",
            run_id="run-2",
            event_type="control-plane.run.submit.accepted",
        )
        decision = await _process(
            service,
            message_id="1710000001000-1",
            run_id="run-2",
            event_type="control-plane.run.succeeded",
        )
        run = await run_repo.get_run(run_id="run-2")
        result = await session.execute(
            text("""
            SELECT decision, reason_code
            FROM control_plane_run_timeline
            WHERE run_id = :rid
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """),
            {"rid": "run-2"},
        )
        timeline = result.first()

    assert decision["decision"] == "REJECTED"
    assert decision["reason_code"] == "ILLEGAL_RUN_TRANSITION"
    assert run is not None
    assert run.status.value == "PENDING"
    assert timeline is not None
    assert str(timeline[0]) == "REJECTED"
    assert str(timeline[1]) == "ILLEGAL_RUN_TRANSITION"


@pytest.mark.asyncio
async def test_worker_state_machine_blocks_duplicate_terminal_outcome() -> None:
    async with get_session_factory()() as session:
        run_repo = DbRunRepository(session)
        consumer_repo = DbConsumerRepository(session)
        service = WorkerStateMachineService(run_repo=run_repo, consumer_repo=consumer_repo)

        await _process(
            service,
            message_id="1710000002000-0",
            run_id="run-3",
            event_type="control-plane.run.submit.accepted",
        )
        await _process(
            service,
            message_id="1710000002000-1",
            run_id="run-3",
            event_type="control-plane.run.started",
        )
        await _process(
            service,
            message_id="1710000002000-2",
            run_id="run-3",
            event_type="control-plane.run.succeeded",
        )

        duplicate_delivery = await _process(
            service,
            message_id="1710000002000-2",
            run_id="run-3",
            event_type="control-plane.run.succeeded",
        )
        conflicting_terminal = await _process(
            service,
            message_id="1710000002000-3",
            run_id="run-3",
            event_type="control-plane.run.failed",
        )
        run = await run_repo.get_run(run_id="run-3")

    assert duplicate_delivery["decision"] == "DUPLICATE"
    assert conflicting_terminal["decision"] == "REJECTED"
    assert conflicting_terminal["reason_code"] == "ILLEGAL_RUN_TRANSITION"
    assert run is not None
    assert run.status.value == "SUCCEEDED"


@pytest.mark.asyncio
async def test_worker_startup_reconciliation_records_only_in_flight_runs() -> None:
    async with get_session_factory()() as session:
        run_repo = DbRunRepository(session)
        consumer_repo = DbConsumerRepository(session)
        service = WorkerStateMachineService(run_repo=run_repo, consumer_repo=consumer_repo)

        await _process(
            service,
            message_id="1710000003000-0",
            run_id="run-4",
            event_type="control-plane.run.submit.accepted",
        )
        await _process(
            service,
            message_id="1710000003000-1",
            run_id="run-5",
            event_type="control-plane.run.submit.accepted",
        )
        await _process(
            service,
            message_id="1710000003000-2",
            run_id="run-5",
            event_type="control-plane.run.started",
        )
        await _process(
            service,
            message_id="1710000003000-3",
            run_id="run-5",
            event_type="control-plane.run.failed",
        )

        reconciled = await service.reconcile_startup(
            worker_instance="worker-a",
            occurred_at="2026-03-08T12:05:00Z",
        )
        result = await session.execute(text("""
            SELECT run_id, event_type, reason_code
            FROM control_plane_run_timeline
            WHERE event_type = 'control-plane.run.reconciled'
            ORDER BY run_id
            """))
        rows = result.all()

    assert reconciled == ["run-4"]
    assert rows == [("run-4", "control-plane.run.reconciled", "WORKER_STARTUP_RECONCILIATION")]
