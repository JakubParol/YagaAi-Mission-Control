from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.orchestration.application.command_service import CommandService
from app.orchestration.application.read_model_service import RunReadModelService
from app.orchestration.application.watchdog_service import WatchdogService
from app.orchestration.application.worker_state_machine_service import WorkerStateMachineService
from app.orchestration.infrastructure.sqlite_repository import DbOrchestrationRepository
from app.shared.api.deps import get_db
from app.shared.db.adapter import SqlTextSession


async def get_command_service(
    db: AsyncSession = Depends(get_db),
) -> CommandService:
    return CommandService(repo=DbOrchestrationRepository(SqlTextSession(db)))


async def get_worker_state_machine_service(
    db: AsyncSession = Depends(get_db),
) -> WorkerStateMachineService:
    return WorkerStateMachineService(repo=DbOrchestrationRepository(SqlTextSession(db)))


async def get_watchdog_service(
    db: AsyncSession = Depends(get_db),
) -> WatchdogService:
    return WatchdogService(repo=DbOrchestrationRepository(SqlTextSession(db)))


async def get_run_read_model_service(
    db: AsyncSession = Depends(get_db),
) -> RunReadModelService:
    return RunReadModelService(repo=DbOrchestrationRepository(SqlTextSession(db)))
