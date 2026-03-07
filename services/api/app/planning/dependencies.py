import aiosqlite
from fastapi import Depends, Query

from app.config import settings
from app.planning.application.agent_service import AgentService
from app.planning.application.backlog_service import BacklogService
from app.planning.application.epic_overview_action_service import EpicOverviewActionService
from app.planning.application.epic_service import EpicService
from app.planning.application.label_service import LabelService
from app.planning.application.project_service import ProjectService
from app.planning.application.story_service import StoryService
from app.planning.application.task_service import TaskService
from app.planning.infrastructure.openclaw_source import FileOpenClawAgentSource
from app.planning.infrastructure.sqlite_repository import (
    SqliteActivityLogRepository,
    SqliteAgentRepository,
    SqliteBacklogRepository,
    SqliteEpicRepository,
    SqliteLabelRepository,
    SqliteProjectRepository,
    SqliteStoryRepository,
    SqliteTaskRepository,
)
from app.shared.api.deps import get_db
from app.shared.api.errors import NotFoundError


async def get_project_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> ProjectService:
    return ProjectService(
        project_repo=SqliteProjectRepository(db),
        backlog_repo=SqliteBacklogRepository(db),
    )


async def get_agent_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> AgentService:
    return AgentService(
        repo=SqliteAgentRepository(db),
        openclaw_source=FileOpenClawAgentSource(settings.openclaw_config_path),
    )


async def get_label_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> LabelService:
    return LabelService(SqliteLabelRepository(db))


async def get_epic_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> EpicService:
    return EpicService(SqliteEpicRepository(db))


async def get_story_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> StoryService:
    return StoryService(SqliteStoryRepository(db))


async def get_task_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> TaskService:
    return TaskService(
        task_repo=SqliteTaskRepository(db),
    )


async def get_backlog_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> BacklogService:
    return BacklogService(SqliteBacklogRepository(db))


async def get_epic_overview_action_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> EpicOverviewActionService:
    return EpicOverviewActionService(
        epic_service=EpicService(SqliteEpicRepository(db)),
        story_service=StoryService(SqliteStoryRepository(db)),
        backlog_service=BacklogService(SqliteBacklogRepository(db)),
        activity_log_repo=SqliteActivityLogRepository(db),
    )


async def resolve_project_key(
    project_id: str | None = Query(None),
    project_key: str | None = Query(None),
    db: aiosqlite.Connection = Depends(get_db),
) -> str | None:
    """Resolve project_key to project_id. project_key takes precedence."""
    if project_key is not None:
        repo = SqliteProjectRepository(db)
        project = await repo.get_by_key(project_key)
        if project is None:
            raise NotFoundError(f"Project with key '{project_key}' not found")
        return project.id
    return project_id


async def resolve_epic_key(
    epic_id: str | None = Query(None),
    epic_key: str | None = Query(None),
    db: aiosqlite.Connection = Depends(get_db),
) -> str | None:
    """Resolve epic_key to epic_id. epic_key takes precedence."""
    if epic_key is not None:
        repo = SqliteEpicRepository(db)
        epic = await repo.get_by_key(epic_key)
        if epic is None:
            raise NotFoundError(f"Epic with key '{epic_key}' not found")
        return epic.id
    return epic_id


async def resolve_story_key(
    story_id: str | None = Query(None),
    story_key: str | None = Query(None),
    db: aiosqlite.Connection = Depends(get_db),
) -> str | None:
    """Resolve story_key to story_id. story_key takes precedence."""
    if story_key is not None:
        repo = SqliteStoryRepository(db)
        story = await repo.get_by_key(story_key)
        if story is None:
            raise NotFoundError(f"Story with key '{story_key}' not found")
        return story.id
    return story_id
