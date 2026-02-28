from typing import Any

from app.planning.application.ports import BacklogRepository
from app.planning.domain.models import Backlog, BacklogKind, BacklogStatus
from app.shared.api.errors import BusinessRuleError, NotFoundError
from app.shared.utils import new_uuid, utc_now


class BacklogService:
    def __init__(self, repo: BacklogRepository) -> None:
        self._repo = repo

    async def list_backlogs(
        self,
        *,
        project_id: str | None = None,
        filter_global: bool = False,
        status: str | None = None,
        kind: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Backlog], int]:
        return await self._repo.list(
            project_id=project_id,
            filter_global=filter_global,
            status=status,
            kind=kind,
            limit=limit,
            offset=offset,
            sort=sort,
        )

    async def get_backlog(self, backlog_id: str) -> Backlog:
        backlog = await self._repo.get_by_id(backlog_id)
        if not backlog:
            raise NotFoundError(f"Backlog {backlog_id} not found")
        return backlog

    async def get_backlog_counts(self, backlog_id: str) -> dict[str, int]:
        return {
            "story_count": await self._repo.get_story_count(backlog_id),
            "task_count": await self._repo.get_task_count(backlog_id),
        }

    async def create_backlog(
        self,
        *,
        project_id: str | None = None,
        name: str,
        kind: BacklogKind,
        goal: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        actor: str | None = None,
    ) -> Backlog:
        now = utc_now()
        backlog = Backlog(
            id=new_uuid(),
            project_id=project_id,
            name=name,
            kind=kind,
            status=BacklogStatus.ACTIVE,
            is_default=False,
            goal=goal,
            start_date=start_date,
            end_date=end_date,
            metadata_json=None,
            created_by=actor,
            updated_by=actor,
            created_at=now,
            updated_at=now,
        )
        return await self._repo.create(backlog)

    async def update_backlog(
        self, backlog_id: str, data: dict[str, Any], *, actor: str | None = None
    ) -> Backlog:
        existing = await self._repo.get_by_id(backlog_id)
        if not existing:
            raise NotFoundError(f"Backlog {backlog_id} not found")

        if "is_default" in data and data["is_default"] and not existing.is_default:
            raise BusinessRuleError("Cannot manually set a backlog as default")

        data["updated_by"] = actor
        data["updated_at"] = utc_now()

        updated = await self._repo.update(backlog_id, data)
        if not updated:
            raise NotFoundError(f"Backlog {backlog_id} not found")
        return updated

    async def delete_backlog(self, backlog_id: str) -> None:
        existing = await self._repo.get_by_id(backlog_id)
        if not existing:
            raise NotFoundError(f"Backlog {backlog_id} not found")

        if existing.is_default:
            raise BusinessRuleError("Cannot delete the default backlog")

        await self._repo.delete(backlog_id)
