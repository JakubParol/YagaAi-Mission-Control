from app.orchestration.application.command_service import CommandService
from app.orchestration.infrastructure.in_memory_repository import InMemoryOrchestrationRepository


async def get_command_service() -> CommandService:
    return CommandService(repo=InMemoryOrchestrationRepository())
