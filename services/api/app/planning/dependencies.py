import aiosqlite
from fastapi import Depends

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
        story_repo=SqliteStoryRepository(db),
    )


async def get_backlog_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> BacklogService:
    return BacklogService(SqliteBacklogRepository(db))
