from app.orchestration.application.ports import OrchestrationRepository
from app.orchestration.domain.models import CommandEnvelope, OutboxEventEnvelope


class InMemoryOrchestrationRepository(OrchestrationRepository):
    async def create_command_with_outbox(
        self,
        *,
        command: CommandEnvelope,
        outbox_event: OutboxEventEnvelope,
    ) -> tuple[CommandEnvelope, OutboxEventEnvelope]:
        return command, outbox_event
