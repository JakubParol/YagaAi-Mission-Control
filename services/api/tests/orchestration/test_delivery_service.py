import pytest

from app.orchestration.application.delivery_service import DeliveryService
from app.orchestration.application.ports import CommandRepository
from app.orchestration.domain.models import (
    CommandEnvelope,
    OutboxEventEnvelope,
    OutboxStatus,
)
from app.shared.api.errors import NotFoundError


class _FakeRepo(CommandRepository):
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
