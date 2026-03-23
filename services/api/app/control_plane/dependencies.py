from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.control_plane.application.command_service import CommandService
from app.control_plane.application.queue_ingress_service import NaomiQueueIngressService
from app.control_plane.application.read_model_service import RunReadModelService
from app.control_plane.application.watchdog_service import WatchdogService
from app.control_plane.application.worker_state_machine_service import WorkerStateMachineService
from app.control_plane.infrastructure.repositories.command import DbCommandRepository
from app.control_plane.infrastructure.repositories.consumer import DbConsumerRepository
from app.control_plane.infrastructure.repositories.naomi_queue import DbNaomiQueueRepository
from app.control_plane.infrastructure.repositories.read_model import DbReadModelRepository
from app.control_plane.infrastructure.repositories.run import DbRunRepository
from app.shared.api.deps import get_db


async def get_command_service(
    db: AsyncSession = Depends(get_db),
) -> CommandService:
    return CommandService(repo=DbCommandRepository(db))


async def get_worker_state_machine_service(
    db: AsyncSession = Depends(get_db),
) -> WorkerStateMachineService:
    return WorkerStateMachineService(
        run_repo=DbRunRepository(db),
        consumer_repo=DbConsumerRepository(db),
    )


async def get_watchdog_service(
    db: AsyncSession = Depends(get_db),
) -> WatchdogService:
    return WatchdogService(repo=DbRunRepository(db))


async def get_run_read_model_service(
    db: AsyncSession = Depends(get_db),
) -> RunReadModelService:
    return RunReadModelService(repo=DbReadModelRepository(db))


async def get_queue_ingress_service(
    db: AsyncSession = Depends(get_db),
) -> NaomiQueueIngressService:
    return NaomiQueueIngressService(repo=DbNaomiQueueRepository(db))
