from abc import ABC, abstractmethod

from app.orchestration.domain.models import CommandEnvelope, OutboxEventEnvelope


class OrchestrationRepository(ABC):
    @abstractmethod
    async def create_command_with_outbox(
        self,
        *,
        command: CommandEnvelope,
        outbox_event: OutboxEventEnvelope,
    ) -> tuple[CommandEnvelope, OutboxEventEnvelope]: ...

    @abstractmethod
    async def get_outbox_event(self, *, outbox_event_id: str) -> OutboxEventEnvelope | None: ...

    @abstractmethod
    async def reschedule_outbox_event(
        self,
        *,
        outbox_event_id: str,
        retry_attempt: int,
        next_retry_at: str,
        last_error: str,
        payload: dict[str, object],
    ) -> None: ...

    @abstractmethod
    async def dead_letter_outbox_event(
        self,
        *,
        outbox_event_id: str,
        dead_lettered_at: str,
        last_error: str,
        dead_letter_payload: dict[str, object],
    ) -> None: ...
