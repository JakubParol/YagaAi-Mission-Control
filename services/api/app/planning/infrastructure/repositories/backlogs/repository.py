from typing import Any

from app.planning.application.ports import BacklogRepository
from app.planning.domain.models import Backlog, BacklogStoryItem, BacklogTaskItem
from app.planning.infrastructure.repositories.backlogs._membership_sql import (
    add_story_item as _add_story_item,
)
from app.planning.infrastructure.repositories.backlogs._membership_sql import (
    add_task_item as _add_task_item,
)
from app.planning.infrastructure.repositories.backlogs._membership_sql import (
    list_task_items as _list_task_items,
)
from app.planning.infrastructure.repositories.backlogs._membership_sql import (
    move_story_item as _move_story_item,
)
from app.planning.infrastructure.repositories.backlogs._membership_sql import (
    remove_story_item as _remove_story_item,
)
from app.planning.infrastructure.repositories.backlogs._membership_sql import (
    remove_task_item as _remove_task_item,
)
from app.planning.infrastructure.repositories.backlogs._membership_sql import (
    reorder_items as _reorder_items,
)
from app.planning.infrastructure.repositories.backlogs._story_projection import (
    get_backlog_story_rows,
)
from app.planning.infrastructure.shared.mappers import _row_to_backlog
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

_SORT_ALLOWED_BACKLOG = {"created_at", "updated_at", "name", "display_order"}
_BACKLOG_PRIORITY_SQL = (
    "CASE "
    "WHEN kind = 'SPRINT' AND status = 'ACTIVE' THEN 0 "
    "WHEN is_default = 1 THEN 2 "
    "ELSE 1 "
    "END"
)
_DEFAULT_BACKLOG_ORDER_SQL = (
    _BACKLOG_PRIORITY_SQL + " ASC, display_order ASC, created_at ASC, id ASC"
)


class DbBacklogRepository(BacklogRepository):
    def __init__(self, db: DbConnection) -> None:
        self._db = db

    async def _repair_active_sprint_integrity(self) -> None:
        duplicate_rows = await _fetch_all(
            self._db,
            """
            SELECT project_id
            FROM backlogs
            WHERE project_id IS NOT NULL AND kind = 'SPRINT' AND status = 'ACTIVE'
            GROUP BY project_id
            HAVING COUNT(*) > 1
            """,
            [],
        )

        for duplicate_row in duplicate_rows:
            project_id = duplicate_row["project_id"]
            keep_row = await _fetch_one(
                self._db,
                """
                SELECT id
                FROM backlogs
                WHERE project_id = ? AND kind = 'SPRINT' AND status = 'ACTIVE'
                ORDER BY display_order ASC, created_at ASC, id ASC
                LIMIT 1
                """,
                [project_id],
            )
            if keep_row is None:
                continue
            await self._db.execute(
                """
                UPDATE backlogs
                SET status = 'OPEN'
                WHERE project_id = ?
                  AND kind = 'SPRINT'
                  AND status = 'ACTIVE'
                  AND id != ?
                """,
                [project_id, keep_row["id"]],
            )

        await self._db.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_backlogs_one_active_sprint_per_project
            ON backlogs (project_id)
            WHERE project_id IS NOT NULL AND kind = 'SPRINT' AND status = 'ACTIVE'
            """,
            [],
        )
        await self._db.commit()

    async def list_all(
        self,
        *,
        project_id: str | None = None,
        filter_global: bool = False,
        status: str | None = None,
        kind: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str | None = None,
    ) -> tuple[list[Backlog], int]:
        await self._repair_active_sprint_integrity()

        where_parts: list[str] = []
        params: list[Any] = []

        if filter_global:
            where_parts.append("project_id IS NULL")
        elif project_id:
            where_parts.append("project_id = ?")
            params.append(project_id)
        if status:
            where_parts.append("status = ?")
            params.append(status)
        if kind:
            where_parts.append("kind = ?")
            params.append(kind)

        if sort and sort.strip():
            order_sql = (
                _BACKLOG_PRIORITY_SQL
                + " ASC, "
                + _parse_sort(sort, _SORT_ALLOWED_BACKLOG)
                + ", id ASC"
            )
        else:
            order_sql = _DEFAULT_BACKLOG_ORDER_SQL
        count_q, select_q = _build_list_queries("backlogs", where_parts, order_sql)

        total = await _fetch_count(self._db, count_q, params)
        rows = await _fetch_all(self._db, select_q, [*params, limit, offset])
        return [_row_to_backlog(r) for r in rows], total

    async def get_by_id(self, backlog_id: str) -> Backlog | None:
        row = await _fetch_one(self._db, "SELECT * FROM backlogs WHERE id = ?", [backlog_id])
        return _row_to_backlog(row) if row else None

    async def create(self, backlog: Backlog) -> Backlog:
        await self._db.execute(
            """INSERT INTO backlogs (id, project_id, name, kind, status, display_order, is_default,
               goal, start_date, end_date, metadata_json,
               created_by, updated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                backlog.id,
                backlog.project_id,
                backlog.name,
                backlog.kind,
                backlog.status,
                backlog.display_order,
                1 if backlog.is_default else 0,
                backlog.goal,
                backlog.start_date,
                backlog.end_date,
                backlog.metadata_json,
                backlog.created_by,
                backlog.updated_by,
                backlog.created_at,
                backlog.updated_at,
            ],
        )
        await self._db.commit()
        return backlog

    async def next_display_order(self, project_id: str | None) -> int:
        if project_id is None:
            row = await _fetch_one(
                self._db,
                "SELECT COALESCE(MAX(display_order), 0) AS max_display_order "
                "FROM backlogs WHERE project_id IS NULL",
                [],
            )
        else:
            row = await _fetch_one(
                self._db,
                "SELECT COALESCE(MAX(display_order), 0) AS max_display_order "
                "FROM backlogs WHERE project_id = ?",
                [project_id],
            )
        max_display_order = int(row["max_display_order"]) if row else 0
        return max_display_order + 100

    async def update(self, backlog_id: str, data: dict[str, Any]) -> Backlog | None:
        allowed = {
            "name",
            "kind",
            "status",
            "goal",
            "start_date",
            "end_date",
            "display_order",
            "metadata_json",
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
            return await self.get_by_id(backlog_id)

        params.append(backlog_id)
        await self._db.execute(_build_update_query("backlogs", sets), params)
        await self._db.commit()
        return await self.get_by_id(backlog_id)

    async def delete(self, backlog_id: str) -> bool:
        cursor = await self._db.execute("DELETE FROM backlogs WHERE id = ?", [backlog_id])
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def has_default(self, project_id: str | None) -> bool:
        if project_id:
            return await _exists(
                self._db,
                "SELECT 1 FROM backlogs WHERE project_id = ? AND is_default = 1",
                [project_id],
            )
        return await _exists(
            self._db,
            "SELECT 1 FROM backlogs WHERE project_id IS NULL AND is_default = 1",
            [],
        )

    async def get_story_count(self, backlog_id: str) -> int:
        return await _fetch_count(
            self._db,
            "SELECT COUNT(*) FROM backlog_stories WHERE backlog_id = ?",
            [backlog_id],
        )

    async def get_task_count(self, backlog_id: str) -> int:
        return await _fetch_count(
            self._db,
            "SELECT COUNT(*) FROM backlog_tasks WHERE backlog_id = ?",
            [backlog_id],
        )

    async def get_story_project_id(self, story_id: str) -> tuple[bool, str | None]:
        row = await _fetch_one(self._db, "SELECT project_id FROM stories WHERE id = ?", [story_id])
        if not row:
            return False, None
        return True, row["project_id"]

    async def get_task_project_id(self, task_id: str) -> tuple[bool, str | None]:
        row = await _fetch_one(self._db, "SELECT project_id FROM tasks WHERE id = ?", [task_id])
        if not row:
            return False, None
        return True, row["project_id"]

    async def story_backlog_id(self, story_id: str) -> str | None:
        row = await _fetch_one(
            self._db,
            "SELECT backlog_id FROM backlog_stories WHERE story_id = ?",
            [story_id],
        )
        return row["backlog_id"] if row else None

    async def get_story_backlog_item(self, story_id: str) -> tuple[str | None, int | None]:
        row = await _fetch_one(
            self._db,
            "SELECT backlog_id, position FROM backlog_stories WHERE story_id = ?",
            [story_id],
        )
        if not row:
            return None, None
        return row["backlog_id"], row["position"]

    async def task_backlog_id(self, task_id: str) -> str | None:
        row = await _fetch_one(
            self._db,
            "SELECT backlog_id FROM backlog_tasks WHERE task_id = ?",
            [task_id],
        )
        return row["backlog_id"] if row else None

    async def add_story_item(
        self, backlog_id: str, story_id: str, position: int | None
    ) -> BacklogStoryItem:
        return await _add_story_item(self._db, backlog_id, story_id, position)

    async def remove_story_item(self, backlog_id: str, story_id: str) -> bool:
        return await _remove_story_item(self._db, backlog_id, story_id)

    async def move_story_item(
        self,
        *,
        source_backlog_id: str,
        target_backlog_id: str,
        story_id: str,
        target_position: int | None,
    ) -> BacklogStoryItem:
        return await _move_story_item(
            self._db,
            source_backlog_id=source_backlog_id,
            target_backlog_id=target_backlog_id,
            story_id=story_id,
            target_position=target_position,
        )

    async def add_task_item(self, backlog_id: str, task_id: str, position: int) -> BacklogTaskItem:
        return await _add_task_item(self._db, backlog_id, task_id, position)

    async def remove_task_item(self, backlog_id: str, task_id: str) -> bool:
        return await _remove_task_item(self._db, backlog_id, task_id)

    async def reorder_items(
        self,
        backlog_id: str,
        stories: list[dict[str, Any]],
        tasks: list[dict[str, Any]],
    ) -> dict[str, int]:
        return await _reorder_items(self._db, backlog_id, stories, tasks)

    async def list_backlog_stories(self, backlog_id: str) -> list[dict[str, Any]]:
        return await get_backlog_story_rows(self._db, backlog_id)

    async def list_task_items(self, backlog_id: str) -> list[BacklogTaskItem]:
        return await _list_task_items(self._db, backlog_id)

    async def get_active_sprint_with_stories(
        self, project_id: str
    ) -> tuple[Backlog | None, list[dict[str, Any]]]:
        backlog = await self.get_active_sprint_backlog(project_id)
        if not backlog:
            return None, []
        return backlog, await get_backlog_story_rows(self._db, backlog.id)

    async def get_active_sprint_backlog(self, project_id: str) -> Backlog | None:
        row = await _fetch_one(
            self._db,
            "SELECT * FROM backlogs WHERE project_id = ? "
            "AND kind = 'SPRINT' AND status = 'ACTIVE' "
            "ORDER BY display_order ASC, created_at ASC, id ASC LIMIT 1",
            [project_id],
        )
        return _row_to_backlog(row) if row else None

    async def get_product_backlog(self, project_id: str) -> Backlog | None:
        row = await _fetch_one(
            self._db,
            "SELECT * FROM backlogs WHERE project_id = ? "
            "AND kind = 'BACKLOG' AND status = 'ACTIVE' "
            "ORDER BY is_default DESC, display_order ASC, created_at ASC, id ASC LIMIT 1",
            [project_id],
        )
        return _row_to_backlog(row) if row else None
