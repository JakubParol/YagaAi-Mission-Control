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
