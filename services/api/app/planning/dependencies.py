from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
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


async def get_work_item_service(
    db: AsyncSession = Depends(get_db),
) -> WorkItemService:
    return WorkItemService(DbWorkItemRepository(db))


async def get_backlog_service(
    db: AsyncSession = Depends(get_db),
) -> BacklogService:
    return BacklogService(DbBacklogRepository(db))


async def get_work_item_action_service(
    db: AsyncSession = Depends(get_db),
) -> WorkItemActionService:
    return WorkItemActionService(
        work_item_service=WorkItemService(DbWorkItemRepository(db)),
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
