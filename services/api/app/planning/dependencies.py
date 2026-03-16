from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.planning.application.agent_service import AgentService
from app.planning.application.backlog_service import BacklogService
from app.planning.application.epic_overview_action_service import EpicOverviewActionService
from app.planning.application.epic_service import EpicService
from app.planning.application.label_service import LabelService
from app.planning.application.project_service import ProjectService
from app.planning.application.story_service import StoryService
from app.planning.application.task_service import TaskService
from app.planning.infrastructure.repositories.activity_log import DbActivityLogRepository
from app.planning.infrastructure.repositories.agents import DbAgentRepository
from app.planning.infrastructure.repositories.backlogs.repository import DbBacklogRepository
from app.planning.infrastructure.repositories.epics import DbEpicRepository
from app.planning.infrastructure.repositories.labels import DbLabelRepository
from app.planning.infrastructure.repositories.projects import DbProjectRepository
from app.planning.infrastructure.repositories.stories import DbStoryRepository
from app.planning.infrastructure.repositories.tasks import DbTaskRepository
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


async def get_epic_service(
    db: AsyncSession = Depends(get_db),
) -> EpicService:
    return EpicService(DbEpicRepository(db))


async def get_story_service(
    db: AsyncSession = Depends(get_db),
) -> StoryService:
    return StoryService(DbStoryRepository(db))


async def get_task_service(
    db: AsyncSession = Depends(get_db),
) -> TaskService:
    return TaskService(
        task_repo=DbTaskRepository(db),
    )


async def get_backlog_service(
    db: AsyncSession = Depends(get_db),
) -> BacklogService:
    return BacklogService(DbBacklogRepository(db))


async def get_epic_overview_action_service(
    db: AsyncSession = Depends(get_db),
) -> EpicOverviewActionService:
    return EpicOverviewActionService(
        epic_service=EpicService(DbEpicRepository(db)),
        story_service=StoryService(DbStoryRepository(db)),
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


async def resolve_epic_key(
    epic_id: str | None = Query(None),
    epic_key: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> str | None:
    """Resolve epic_key to epic_id. epic_key takes precedence."""
    if epic_key is not None:
        repo = DbEpicRepository(db)
        epic = await repo.get_by_key(epic_key)
        if epic is None:
            raise NotFoundError(f"Epic with key '{epic_key}' not found")
        return epic.id
    return epic_id


async def resolve_story_key(
    story_id: str | None = Query(None),
    story_key: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> str | None:
    """Resolve story_key to story_id. story_key takes precedence."""
    if story_key is not None:
        repo = DbStoryRepository(db)
        story = await repo.get_by_key(story_key)
        if story is None:
            raise NotFoundError(f"Story with key '{story_key}' not found")
        return story.id
    return story_id
