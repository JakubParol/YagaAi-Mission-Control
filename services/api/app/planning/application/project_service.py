from typing import Any

from app.planning.application.ports import BacklogRepository, ProjectRepository
from app.planning.domain.models import (
    Backlog,
    BacklogKind,
    BacklogStatus,
    Project,
    ProjectStatus,
)
from app.shared.api.errors import ConflictError, NotFoundError
from app.shared.utils import new_uuid, utc_now


class ProjectService:
    def __init__(
        self,
        project_repo: ProjectRepository,
        backlog_repo: BacklogRepository,
    ) -> None:
        self._project_repo = project_repo
        self._backlog_repo = backlog_repo

    async def list_projects(
        self,
        *,
        key: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Project], int]:
        return await self._project_repo.list_all(
            key=key, status=status, limit=limit, offset=offset, sort=sort
        )

    async def get_project(self, project_id: str) -> Project:
        project = await self._project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError(f"Project {project_id} not found")
        return project

    async def create_project(
        self,
        *,
        key: str,
        name: str,
        description: str | None = None,
        repo_root: str | None = None,
        actor: str | None = None,
    ) -> Project:
        if await self._project_repo.key_exists(key):
            raise ConflictError(f"Project with key '{key}' already exists")

        now = utc_now()
        project = Project(
            id=new_uuid(),
            key=key.upper(),
            name=name,
            description=description,
            status=ProjectStatus.ACTIVE,
            repo_root=repo_root,
            created_by=actor,
            updated_by=actor,
            created_at=now,
            updated_at=now,
        )
        created = await self._project_repo.create(project)
        await self._project_repo.create_project_counter(created.id)

        default_backlog = Backlog(
            id=new_uuid(),
            project_id=created.id,
            name=f"{created.key} Backlog",
            kind=BacklogKind.BACKLOG,
            status=BacklogStatus.ACTIVE,
            is_default=True,
            goal=None,
            start_date=None,
            end_date=None,
            metadata_json=None,
            created_by=actor,
            updated_by=actor,
            created_at=now,
            updated_at=now,
        )
        await self._backlog_repo.create(default_backlog)

        return created

    async def update_project(
        self, project_id: str, data: dict[str, Any], *, actor: str | None = None
    ) -> Project:
        existing = await self._project_repo.get_by_id(project_id)
        if not existing:
            raise NotFoundError(f"Project {project_id} not found")

        data["updated_by"] = actor
        data["updated_at"] = utc_now()

        updated = await self._project_repo.update(project_id, data)
        if not updated:
            raise NotFoundError(f"Project {project_id} not found")
        return updated

    async def delete_project(self, project_id: str) -> None:
        existing = await self._project_repo.get_by_id(project_id)
        if not existing:
            raise NotFoundError(f"Project {project_id} not found")
        await self._project_repo.delete(project_id)
