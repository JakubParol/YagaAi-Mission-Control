from typing import Any

from fastapi import Depends

from app.orchestration.application.command_service import CommandService
from app.orchestration.application.read_model_service import RunReadModelService
from app.orchestration.application.watchdog_service import WatchdogService
from app.orchestration.application.worker_state_machine_service import WorkerStateMachineService
from app.orchestration.infrastructure.sqlite_repository import SqliteOrchestrationRepository
from app.shared.api.deps import get_db


async def get_command_service(
    db: Any = Depends(get_db),
) -> CommandService:
    return CommandService(repo=SqliteOrchestrationRepository(db))


async def get_worker_state_machine_service(
    db: Any = Depends(get_db),
) -> WorkerStateMachineService:
    return WorkerStateMachineService(repo=SqliteOrchestrationRepository(db))


async def get_watchdog_service(
    db: Any = Depends(get_db),
) -> WatchdogService:
    return WatchdogService(repo=SqliteOrchestrationRepository(db))


async def get_run_read_model_service(
    db: Any = Depends(get_db),
) -> RunReadModelService:
    return RunReadModelService(repo=SqliteOrchestrationRepository(db))
