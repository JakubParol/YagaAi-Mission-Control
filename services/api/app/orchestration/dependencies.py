import aiosqlite
from fastapi import Depends

from app.orchestration.application.command_service import CommandService
from app.orchestration.application.worker_state_machine_service import WorkerStateMachineService
from app.orchestration.infrastructure.sqlite_repository import SqliteOrchestrationRepository
from app.shared.api.deps import get_db


async def get_command_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> CommandService:
    return CommandService(repo=SqliteOrchestrationRepository(db))


async def get_worker_state_machine_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> WorkerStateMachineService:
    return WorkerStateMachineService(repo=SqliteOrchestrationRepository(db))
