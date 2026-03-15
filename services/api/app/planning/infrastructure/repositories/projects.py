from typing import Any

from app.planning.application.ports import ProjectRepository
from app.planning.domain.models import Project
from app.planning.infrastructure.shared.mappers import _row_to_project
from app.planning.infrastructure.shared.sql import (
    DbConnection,
    _build_list_queries,
    _build_update_query,
    _exists,
    _fetch_all,
    _fetch_count,
    _fetch_one,
    _parse_sort,
)
from app.shared.utils import utc_now

_SORT_ALLOWED_PROJECT = {"created_at", "updated_at", "name", "key"}


class DbProjectRepository(ProjectRepository):
    def __init__(self, db: DbConnection) -> None:
        self._db = db

    async def _unset_default_projects(self, *, except_project_id: str | None = None) -> None:
        if except_project_id:
            await self._db.execute(
                "UPDATE projects SET is_default = 0 WHERE is_default = 1 AND id != ?",
                [except_project_id],
            )
            return
        await self._db.execute("UPDATE projects SET is_default = 0 WHERE is_default = 1", [])

    async def list_all(
        self,
        *,
        key: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Project], int]:
        where_parts: list[str] = []
        params: list[Any] = []

        if key:
            where_parts.append("key = ?")
            params.append(key)
        if status:
            where_parts.append("status = ?")
            params.append(status)

        order_sql = _parse_sort(sort, _SORT_ALLOWED_PROJECT)
        count_q, select_q = _build_list_queries("projects", where_parts, order_sql)

        total = await _fetch_count(self._db, count_q, params)
        rows = await _fetch_all(self._db, select_q, [*params, limit, offset])
        return [_row_to_project(r) for r in rows], total

    async def get_by_id(self, project_id: str) -> Project | None:
        row = await _fetch_one(self._db, "SELECT * FROM projects WHERE id = ?", [project_id])
        return _row_to_project(row) if row else None

    async def get_by_key(self, key: str) -> Project | None:
        row = await _fetch_one(self._db, "SELECT * FROM projects WHERE key = ?", [key.upper()])
        return _row_to_project(row) if row else None

    async def key_exists(self, key: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM projects WHERE key = ?", [key.upper()])

    async def create(self, project: Project) -> Project:
        if project.is_default:
            await self._unset_default_projects()
        await self._db.execute(
            """INSERT INTO projects (id, key, name, description, status, is_default, repo_root,
               created_by, updated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                project.id,
                project.key,
                project.name,
                project.description,
                project.status,
                1 if project.is_default else 0,
                project.repo_root,
                project.created_by,
                project.updated_by,
                project.created_at,
                project.updated_at,
            ],
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
        sets = []
        params: list[Any] = []
        for k, v in data.items():
            if k in allowed:
                sets.append(k + " = ?")
                params.append(v)

        if not sets:
            return await self.get_by_id(project_id)

        if data.get("is_default") is True:
            await self._unset_default_projects(except_project_id=project_id)

        params.append(project_id)
        await self._db.execute(_build_update_query("projects", sets), params)
        await self._db.commit()
        return await self.get_by_id(project_id)

    async def delete(self, project_id: str) -> bool:
        cursor = await self._db.execute("DELETE FROM projects WHERE id = ?", [project_id])
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def create_project_counter(self, project_id: str) -> None:
        await self._db.execute(
            """INSERT OR IGNORE INTO project_counters (project_id, next_number, updated_at)
               VALUES (?, 1, ?)""",
            [project_id, utc_now()],
        )
        await self._db.commit()
