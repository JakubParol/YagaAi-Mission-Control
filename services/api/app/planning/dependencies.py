import logging

from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.control_plane.application.queue_ingress_service import QueueIngressService
from app.control_plane.infrastructure.repositories.agent_queue import DbAgentQueueRepository
from app.planning.application.agent_service import AgentService
from app.planning.application.backlog_service import BacklogService
from app.planning.application.label_service import LabelService
from app.planning.application.project_service import ProjectService
from app.planning.application.work_item_action_service import WorkItemActionService
from app.planning.application.work_item_service import WorkItemService
from app.planning.infrastructure.repositories.activity_log import DbActivityLogRepository
from app.planning.infrastructure.repositories.agents import DbAgentRepository
from app.planning.infrastructure.repositories.backlogs.repository import DbBacklogRepository
from app.planning.infrastructure.repositories.labels import DbLabelRepository
from app.planning.infrastructure.repositories.projects import DbProjectRepository
from app.planning.infrastructure.repositories.work_items import DbWorkItemRepository
from app.planning.infrastructure.sources.openclaw import FileOpenClawAgentSource
from app.shared.api.deps import get_db
from app.shared.api.errors import NotFoundError
from app.shared.logging import log_event
from app.shared.ports import OnAssignmentChanged

logger = logging.getLogger(__name__)


async def get_project_service(
    db: AsyncSession = Depends(get_db),
) -> ProjectService:
    return ProjectService(
        project_repo=DbProjectRepository(db),
        backlog_repo=DbBacklogRepository(db),
    )


async def get_agent_service(
    db: AsyncSession = Depends(get_db),
) -> AgentService:
    return AgentService(
        repo=DbAgentRepository(db),
        openclaw_source=FileOpenClawAgentSource(settings.openclaw_config_path),
    )


async def get_label_service(
    db: AsyncSession = Depends(get_db),
) -> LabelService:
    return LabelService(DbLabelRepository(db))


def _make_assignment_hook(
    ingress: QueueIngressService,
) -> "OnAssignmentChanged":
    async def on_assignment_changed(
        *,
        work_item_id: str,
        work_item_key: str | None,
        work_item_type: str,
        work_item_status: str,
        agent_id: str | None,
        previous_agent_id: str | None,
    ) -> None:
        try:
            await ingress.handle_assignment_changed(
                work_item_id=work_item_id,
                work_item_key=work_item_key or "",
                work_item_type=work_item_type,
                work_item_status=work_item_status,
                agent_id=agent_id,
                previous_agent_id=previous_agent_id,
            )
        except Exception:
            log_event(
                logger,
                level=logging.WARNING,
                event="assignment_queue_bridge.failed",
                work_item_id=work_item_id,
            )

    return on_assignment_changed


async def get_work_item_service(
    db: AsyncSession = Depends(get_db),
) -> WorkItemService:
    ingress = QueueIngressService(repo=DbAgentQueueRepository(db))
    hook = _make_assignment_hook(ingress)
    return WorkItemService(DbWorkItemRepository(db), on_assignment_changed=hook)


async def get_backlog_service(
    db: AsyncSession = Depends(get_db),
) -> BacklogService:
    return BacklogService(DbBacklogRepository(db))


async def get_work_item_action_service(
    db: AsyncSession = Depends(get_db),
) -> WorkItemActionService:
    ingress = QueueIngressService(repo=DbAgentQueueRepository(db))
    hook = _make_assignment_hook(ingress)
    return WorkItemActionService(
        work_item_service=WorkItemService(DbWorkItemRepository(db), on_assignment_changed=hook),
        backlog_service=BacklogService(DbBacklogRepository(db)),
        activity_log_repo=DbActivityLogRepository(db),
    )


async def resolve_project_key(
    project_id: str | None = Query(None),
    project_key: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> str | None:
    """Resolve project_key to project_id. project_key takes precedence."""
    if project_key is not None:
        repo = DbProjectRepository(db)
        project = await repo.get_by_key(project_key)
        if project is None:
            raise NotFoundError(f"Project with key '{project_key}' not found")
        return project.id
    return project_id
