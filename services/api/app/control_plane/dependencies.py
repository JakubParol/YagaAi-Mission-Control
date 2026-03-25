from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.control_plane.application.command_service import CommandService
from app.control_plane.application.dispatch_selection_service import DispatchSelectionService
from app.control_plane.application.openclaw_dispatch_service import OpenClawDispatchService
from app.control_plane.application.queue_dispatch_service import QueueDispatchService
from app.control_plane.application.queue_ingress_service import QueueIngressService
from app.control_plane.application.read_model_service import RunReadModelService
from app.control_plane.application.watchdog_service import WatchdogService
from app.control_plane.application.worker_state_machine_service import WorkerStateMachineService
from app.control_plane.infrastructure.repositories.agent_queue import DbAgentQueueRepository
from app.control_plane.infrastructure.repositories.command import DbCommandRepository
from app.control_plane.infrastructure.repositories.consumer import DbConsumerRepository
from app.control_plane.infrastructure.repositories.dispatch_record import DbDispatchRecordRepository
from app.control_plane.infrastructure.repositories.read_model import DbReadModelRepository
from app.control_plane.infrastructure.repositories.run import DbRunRepository
from app.control_plane.infrastructure.sources.openclaw_adapter import (
    GatewayWsDispatchAdapter,
)
from app.shared.agent_lookup_adapter import DbAgentLookupAdapter
from app.shared.api.deps import get_db


def build_queue_dispatch_service(db: AsyncSession) -> QueueDispatchService:
    """Build QueueDispatchService — plain factory for cross-module reuse."""
    queue_repo = DbAgentQueueRepository(db)
    dispatch_repo = DbDispatchRecordRepository(db)
    return QueueDispatchService(
        ingress=QueueIngressService(repo=queue_repo),
        selection=DispatchSelectionService(repo=queue_repo),
        dispatch=OpenClawDispatchService(
            queue_repo=queue_repo,
            dispatch_repo=dispatch_repo,
            openclaw_adapter=GatewayWsDispatchAdapter(
                gateway_url=settings.openclaw_gateway_url,
                device_auth_dir=settings.openclaw_device_auth_dir,
            ),
            mc_api_base_url=settings.base_url,
        ),
        agent_lookup=DbAgentLookupAdapter(db),
    )


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
) -> QueueIngressService:
    return QueueIngressService(repo=DbAgentQueueRepository(db))


async def get_dispatch_selection_service(
    db: AsyncSession = Depends(get_db),
) -> DispatchSelectionService:
    return DispatchSelectionService(repo=DbAgentQueueRepository(db))


async def get_queue_dispatch_service(
    db: AsyncSession = Depends(get_db),
) -> QueueDispatchService:
    return build_queue_dispatch_service(db)
