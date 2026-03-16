from typing import Any
from typing import cast as type_cast

from sqlalchemy import delete, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.functions import count

from app.planning.application.ports import ProjectRepository
from app.planning.domain.models import Project
from app.planning.infrastructure.shared.mappers import _row_to_project
from app.planning.infrastructure.shared.sorting import parse_sort
from app.planning.infrastructure.tables import project_counters, projects
from app.shared.utils import utc_now

_SORT_ALLOWED_PROJECT = {
    "created_at": projects.c.created_at,
    "updated_at": projects.c.updated_at,
    "name": projects.c.name,
    "key": projects.c.key,
}


class DbProjectRepository(ProjectRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _unset_default_projects(self, *, except_project_id: str | None = None) -> None:
        stmt = update(projects).where(projects.c.is_default == 1)
        if except_project_id:
            stmt = stmt.where(projects.c.id != except_project_id)
        stmt = stmt.values(is_default=0)
        await self._db.execute(stmt)

    async def list_all(
        self,
        *,
        key: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Project], int]:
        conditions = []
        if key:
            conditions.append(projects.c.key == key)
        if status:
            conditions.append(projects.c.status == status)

        order = parse_sort(sort, _SORT_ALLOWED_PROJECT)
        if not order:
            order = [projects.c.created_at.desc()]

        count_q = select(count()).select_from(projects)
        select_q = select(projects)
        for cond in conditions:
            count_q = count_q.where(cond)
            select_q = select_q.where(cond)
        select_q = select_q.order_by(*order).limit(limit).offset(offset)

        total = (await self._db.execute(count_q)).scalar_one()
        rows = (await self._db.execute(select_q)).mappings().all()
        return [_row_to_project(r) for r in rows], total

    async def get_by_id(self, project_id: str) -> Project | None:
        row = (
            (await self._db.execute(select(projects).where(projects.c.id == project_id)))
            .mappings()
            .first()
        )
        return _row_to_project(row) if row else None

    async def get_by_key(self, key: str) -> Project | None:
        row = (
            (await self._db.execute(select(projects).where(projects.c.key == key.upper())))
            .mappings()
            .first()
        )
        return _row_to_project(row) if row else None

    async def key_exists(self, key: str) -> bool:
        row = (
            await self._db.execute(select(projects.c.id).where(projects.c.key == key.upper()))
        ).first()
        return row is not None

    async def create(self, project: Project) -> Project:
        if project.is_default:
            await self._unset_default_projects()
        await self._db.execute(
            insert(projects).values(
                id=project.id,
                key=project.key,
                name=project.name,
                description=project.description,
                status=project.status,
                is_default=1 if project.is_default else 0,
                repo_root=project.repo_root,
                created_by=project.created_by,
                updated_by=project.updated_by,
                created_at=project.created_at,
                updated_at=project.updated_at,
            )
        )
        await self._db.commit()
        return project

    async def update(self, project_id: str, data: dict[str, Any]) -> Project | None:
        allowed = {
            "name",
            "description",
            "status",
            "is_default",
            "repo_root",
            "updated_by",
            "updated_at",
        }
        values = {k: v for k, v in data.items() if k in allowed}
        if not values:
            return await self.get_by_id(project_id)

        if data.get("is_default") is True:
            await self._unset_default_projects(except_project_id=project_id)

        await self._db.execute(update(projects).where(projects.c.id == project_id).values(**values))
        await self._db.commit()
        return await self.get_by_id(project_id)

    async def delete(self, project_id: str) -> bool:
        result = type_cast(
            CursorResult,
            await self._db.execute(delete(projects).where(projects.c.id == project_id)),
        )
        await self._db.commit()
        return (result.rowcount or 0) > 0

    async def create_project_counter(self, project_id: str) -> None:
        await self._db.execute(
            pg_insert(project_counters)
            .values(project_id=project_id, next_number=1, updated_at=utc_now())
            .on_conflict_do_nothing()
        )
        await self._db.commit()
