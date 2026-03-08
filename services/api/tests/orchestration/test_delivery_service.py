import pytest

from app.orchestration.application.delivery_service import DeliveryService
from app.orchestration.application.ports import OrchestrationRepository
from app.orchestration.domain.models import (
    CommandEnvelope,
    OrchestrationHealthSnapshot,
    OrchestrationRun,
    OrchestrationStep,
    OutboxEventEnvelope,
    OutboxStatus,
    RunAttemptReadModel,
    RunReadModel,
    RunStatus,
    RunTimelineEntry,
    StepStatus,
    TimelineEntryReadModel,
)
from app.shared.api.errors import NotFoundError


class _FakeRepo(OrchestrationRepository):
    def __init__(self, event: OutboxEventEnvelope | None) -> None:
        self.event = event
        self.rescheduled: dict | None = None
        self.dead_lettered: dict | None = None

    async def create_command_with_outbox(
        self,
        *,
        command: CommandEnvelope,
        outbox_event: OutboxEventEnvelope,
    ) -> tuple[CommandEnvelope, OutboxEventEnvelope]:
        return command, outbox_event

    async def get_outbox_event(self, *, outbox_event_id: str) -> OutboxEventEnvelope | None:
        if self.event is None or self.event.id != outbox_event_id:
            return None
        return self.event

    async def reschedule_outbox_event(
        self,
        *,
        outbox_event_id: str,
        retry_attempt: int,
        next_retry_at: str,
        last_error: str,
        payload: dict[str, object],
    ) -> None:
        self.rescheduled = {
            "outbox_event_id": outbox_event_id,
            "retry_attempt": retry_attempt,
            "next_retry_at": next_retry_at,
            "last_error": last_error,
            "payload": payload,
        }

    async def dead_letter_outbox_event(
        self,
        *,
        outbox_event_id: str,
        dead_lettered_at: str,
        last_error: str,
        dead_letter_payload: dict[str, object],
    ) -> None:
        self.dead_lettered = {
            "outbox_event_id": outbox_event_id,
            "dead_lettered_at": dead_lettered_at,
            "last_error": last_error,
            "dead_letter_payload": dead_letter_payload,
        }

    async def get_consumer_offset(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
    ) -> str | None:
        return None

    async def upsert_consumer_offset(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
        last_message_id: str,
        updated_at: str,
    ) -> None:
        return None

    async def is_message_processed(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        message_id: str,
    ) -> bool:
        return False

    async def mark_message_processed(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        message_id: str,
        correlation_id: str,
        processed_at: str,
    ) -> None:
        return None

    async def mark_message_processed_and_checkpoint(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
        message_id: str,
        correlation_id: str,
        processed_at: str,
    ) -> None:
        return None

    async def get_run(self, *, run_id: str) -> OrchestrationRun | None:
        return None

    async def create_run(self, *, run: OrchestrationRun) -> None:
        return None

    async def update_run_status(
        self,
        *,
        run_id: str,
        status: RunStatus,
        current_step_id: str | None,
        last_event_type: str,
        updated_at: str,
        terminal_at: str | None,
    ) -> None:
        return None

    async def list_in_flight_runs(self) -> list[OrchestrationRun]:
        return []

    async def get_step(self, *, run_id: str, step_id: str) -> OrchestrationStep | None:
        return None

    async def create_step(self, *, step: OrchestrationStep) -> None:
        return None

    async def update_step_status(
        self,
        *,
        run_id: str,
        step_id: str,
        status: StepStatus,
        last_event_type: str,
        updated_at: str,
        terminal_at: str | None,
    ) -> None:
        return None

    async def append_timeline_entry(self, *, entry: RunTimelineEntry) -> None:
        return None

    async def compare_and_set_run_lease(
        self,
        *,
        run_id: str,
        expected_lease_token: str | None,
        lease_owner: str | None,
        new_lease_token: str | None,
        heartbeat_at: str | None,
        timeout_at: str | None,
        updated_at: str,
    ) -> bool:
        return True

    async def apply_watchdog_action_if_lease_matches(
        self,
        *,
        run_id: str,
        expected_lease_token: str | None,
        next_status: RunStatus,
        current_step_id: str | None,
        last_event_type: str,
        updated_at: str,
        terminal_at: str | None,
        watchdog_attempt: int,
        watchdog_state: str,
        clear_lease: bool,
    ) -> bool:
        return True

    async def list_runs(
        self,
        *,
        run_id: str | None,
        status: RunStatus | None,
        limit: int,
        offset: int,
    ) -> tuple[list[RunReadModel], int]:
        return [], 0

    async def get_run_read_model(self, *, run_id: str) -> RunReadModel | None:
        return None

    async def list_timeline_entries(
        self,
        *,
        run_id: str | None,
        run_status: RunStatus | None,
        event_type: str | None,
        occurred_after: str | None,
        occurred_before: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[TimelineEntryReadModel], int]:
        return [], 0

    async def list_run_attempts(
        self,
        *,
        run_id: str,
        limit: int,
        offset: int,
    ) -> tuple[list[RunAttemptReadModel], int]:
        return [], 0

    async def get_health_snapshot(self) -> OrchestrationHealthSnapshot:
        return OrchestrationHealthSnapshot(
            queue_pending=0,
            queue_oldest_pending_at=None,
            retries_total=0,
            dead_letter_total=0,
            watchdog_interventions=0,
            run_latencies_ms=[],
        )


def _event(*, retry_attempt: int, max_attempts: int = 3) -> OutboxEventEnvelope:
    return OutboxEventEnvelope(
        id="out-1",
        command_id="cmd-1",
        event_type="orchestration.run.submit.accepted",
        schema_version="1.0",
        occurred_at="2026-03-08T09:00:00Z",
        producer="mc-cli",
        correlation_id="corr-1",
        causation_id="cause-1",
        payload={"accepted_command_id": "cmd-1"},
        status=OutboxStatus.PENDING,
        created_at="2026-03-08T09:00:00Z",
        retry_attempt=retry_attempt,
        max_attempts=max_attempts,
    )


@pytest.mark.asyncio
async def test_record_processing_failure_reschedules_with_backoff() -> None:
    repo = _FakeRepo(_event(retry_attempt=1, max_attempts=3))
    service = DeliveryService(repo=repo)

    decision = await service.record_processing_failure(
        outbox_event_id="out-1",
        source_stream="mc:orchestration:events:orchestration_run_submit_accepted:v1:p0",
        source_message_id="1710000000000-0",
        error_code="WORKER_ERROR",
        error_message="handler timeout",
        failed_at="2026-03-08T09:00:00Z",
    )

    assert decision["decision"] == "RETRY"
    assert repo.rescheduled is not None
    assert repo.rescheduled["retry_attempt"] == 2
    assert repo.rescheduled["last_error"] == "WORKER_ERROR: handler timeout"
    assert repo.dead_lettered is None


@pytest.mark.asyncio
async def test_record_processing_failure_dead_letters_when_attempts_exhausted() -> None:
    repo = _FakeRepo(_event(retry_attempt=3, max_attempts=3))
    service = DeliveryService(repo=repo)

    decision = await service.record_processing_failure(
        outbox_event_id="out-1",
        source_stream="mc:orchestration:events:orchestration_run_submit_accepted:v1:p0",
        source_message_id="1710000000000-1",
        error_code="WORKER_ERROR",
        error_message="poison payload",
        failed_at="2026-03-08T09:00:00Z",
    )

    assert decision["decision"] == "DEAD_LETTER"
    assert repo.dead_lettered is not None
    assert repo.dead_lettered["last_error"] == "WORKER_ERROR: poison payload"
    payload = repo.dead_lettered["dead_letter_payload"]
    assert payload["source_message_id"] == "1710000000000-1"
    assert payload["dead_letter_reason"] == "MAX_ATTEMPTS_EXCEEDED"
    assert repo.rescheduled is None


@pytest.mark.asyncio
async def test_record_processing_failure_raises_not_found_for_missing_event() -> None:
    repo = _FakeRepo(None)
    service = DeliveryService(repo=repo)
    with pytest.raises(NotFoundError):
        await service.record_processing_failure(
            outbox_event_id="missing",
            source_stream="mc:orchestration:events:topic:v1:p0",
            source_message_id="1710000000000-0",
            error_code="WORKER_ERROR",
            error_message="missing",
            failed_at="2026-03-08T09:00:00Z",
        )
