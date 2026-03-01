import aiosqlite
from fastapi import Depends, Query

from app.planning.application.agent_service import AgentService
from app.planning.application.backlog_service import BacklogService
from app.planning.application.epic_service import EpicService
from app.planning.application.label_service import LabelService
from app.planning.application.project_service import ProjectService
from app.planning.application.story_service import StoryService
from app.planning.application.task_service import TaskService
from app.planning.infrastructure.sqlite_repository import (
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
    return AgentService(SqliteAgentRepository(db))


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
