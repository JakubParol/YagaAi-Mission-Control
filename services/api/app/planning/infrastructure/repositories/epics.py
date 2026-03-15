from typing import Any

from app.planning.application.ports import EpicRepository
from app.planning.domain.models import Epic, EpicOverview
from app.planning.infrastructure.shared.keys import _allocate_next_key, _project_exists
from app.planning.infrastructure.shared.mappers import _row_to_epic, _row_to_epic_overview
from app.planning.infrastructure.shared.sql import (
    DbConnection,
    _build_list_queries,
    _build_update_query,
    _fetch_all,
    _fetch_count,
    _fetch_one,
    _parse_sort,
    _parse_sort_mapped,
)

_SORT_ALLOWED_EPIC = {"created_at", "updated_at", "title", "priority", "status"}
_SORT_ALLOWED_EPIC_OVERVIEW = {
    "priority": "priority",
    "progress_pct": "progress_pct",
    "progress_trend_7d": "progress_trend_7d",
    "updated_at": "updated_at",
    "blocked_count": "blocked_count",
}


class DbEpicRepository(EpicRepository):
    def __init__(self, db: DbConnection) -> None:
        self._db = db

    async def list_all(
        self,
        *,
        key: str | None = None,
        project_id: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Epic], int]:
        where_parts: list[str] = []
        params: list[Any] = []

        if key:
            where_parts.append("key = ?")
            params.append(key)
        if project_id:
            where_parts.append("project_id = ?")
            params.append(project_id)
        if status:
            where_parts.append("status = ?")
            params.append(status)

        order_sql = _parse_sort(sort, _SORT_ALLOWED_EPIC)
        count_q, select_q = _build_list_queries("epics", where_parts, order_sql)

        total = await _fetch_count(self._db, count_q, params)
        rows = await _fetch_all(self._db, select_q, [*params, limit, offset])
        return [_row_to_epic(r) for r in rows], total

    async def list_overview(
        self,
        *,
        project_id: str | None = None,
        status: str | None = None,
        owner: str | None = None,
        is_blocked: bool | None = None,
        label: str | None = None,
        text: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-updated_at",
    ) -> tuple[list[EpicOverview], int]:
        where_parts: list[str] = []
        params: list[Any] = []

        if project_id:
            where_parts.append("e.project_id = ?")
            params.append(project_id)
        if status:
            where_parts.append("e.status = ?")
            params.append(status)
        if owner:
            where_parts.append(
                "EXISTS (SELECT 1 FROM stories so "
                "WHERE so.epic_id = e.id AND so.current_assignee_agent_id = ?)"
            )
            params.append(owner)
        if label:
            where_parts.append(
                "EXISTS ("
                "SELECT 1 "
                "FROM stories sls "
                "JOIN story_labels sl ON sl.story_id = sls.id "
                "JOIN labels l ON l.id = sl.label_id "
                "WHERE sls.epic_id = e.id AND lower(l.name) = lower(?)"
                ")"
            )
            params.append(label)
        if text:
            like = "%" + text.strip() + "%"
            where_parts.append("(e.title ILIKE ? OR e.key ILIKE ?)")
            params.extend([like, like])
        if is_blocked is True:
            where_parts.append("(e.is_blocked = 1 OR COALESCE(ss.blocked_count, 0) > 0)")
        if is_blocked is False:
            where_parts.append("(e.is_blocked = 0 AND COALESCE(ss.blocked_count, 0) = 0)")

        where_sql = (" WHERE " + " AND ".join(where_parts)) if where_parts else ""
        base_sql = (
            "SELECT "
            "e.key AS epic_key, "
            "e.title AS title, "
            "e.status AS status, "
            "CASE "
            "  WHEN COALESCE(ss.stories_total, 0) = 0 THEN 0.0 "
            "  ELSE ROUND(COALESCE(ss.stories_done, 0) * 100.0 / ss.stories_total, 2) "
            "END AS progress_pct, "
            "CASE "
            "  WHEN COALESCE(ss.stories_total, 0) = 0 THEN 0.0 "
            "  ELSE ROUND(COALESCE(ss.stories_done_last_7d, 0) * 100.0 / ss.stories_total, 2) "
            "END AS progress_trend_7d, "
            "COALESCE(ss.stories_total, 0) AS stories_total, "
            "COALESCE(ss.stories_done, 0) AS stories_done, "
            "COALESCE(ss.stories_in_progress, 0) AS stories_in_progress, "
            "COALESCE(ss.blocked_count, 0) AS blocked_count, "
            "CAST(GREATEST(0, julianday('now') - julianday(e.updated_at)) AS INTEGER) AS stale_days, "
            "e.priority AS priority, "
            "e.updated_at AS updated_at "
            "FROM epics e "
            "LEFT JOIN ("
            "  SELECT "
            "    s.epic_id AS epic_id, "
            "    COUNT(*) AS stories_total, "
            "    SUM(CASE WHEN s.status = 'DONE' THEN 1 ELSE 0 END) AS stories_done, "
            "    SUM(CASE WHEN s.status = 'DONE' AND s.completed_at IS NOT NULL "
            "             AND CAST(s.completed_at AS TIMESTAMPTZ) >= datetime('now', '-7 days') "
            "        THEN 1 ELSE 0 END) AS stories_done_last_7d, "
            "    SUM(CASE WHEN s.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS stories_in_progress, "
            "    SUM(CASE WHEN s.is_blocked = 1 THEN 1 ELSE 0 END) AS blocked_count "
            "  FROM stories s "
            "  WHERE s.epic_id IS NOT NULL "
            "  GROUP BY s.epic_id"
            ") ss ON ss.epic_id = e.id" + where_sql
        )

        order_sql = _parse_sort_mapped(
            sort,
            _SORT_ALLOWED_EPIC_OVERVIEW,
            "updated_at DESC, epic_key ASC",
        )
        count_q = "SELECT COUNT(*) FROM (" + base_sql + ") q"
        select_q = base_sql + " ORDER BY " + order_sql + " LIMIT ? OFFSET ?"

        total = await _fetch_count(self._db, count_q, params)
        rows = await _fetch_all(self._db, select_q, [*params, limit, offset])
        return [_row_to_epic_overview(r) for r in rows], total

    async def get_by_id(self, epic_id: str) -> Epic | None:
        row = await _fetch_one(self._db, "SELECT * FROM epics WHERE id = ?", [epic_id])
        return _row_to_epic(row) if row else None

    async def get_by_key(self, key: str) -> Epic | None:
        row = await _fetch_one(self._db, "SELECT * FROM epics WHERE key = ?", [key.upper()])
        return _row_to_epic(row) if row else None

    async def create(self, epic: Epic) -> Epic:
        await self._db.execute(
            """INSERT INTO epics (id, project_id, key, title, description,
               status, status_mode, status_override, status_override_set_at,
               is_blocked, blocked_reason, priority, metadata_json,
               created_by, updated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                epic.id,
                epic.project_id,
                epic.key,
                epic.title,
                epic.description,
                epic.status,
                epic.status_mode,
                epic.status_override,
                epic.status_override_set_at,
                1 if epic.is_blocked else 0,
                epic.blocked_reason,
                epic.priority,
                epic.metadata_json,
                epic.created_by,
                epic.updated_by,
                epic.created_at,
                epic.updated_at,
            ],
        )
        await self._db.commit()
        return epic

    async def update(self, epic_id: str, data: dict[str, Any]) -> Epic | None:
        allowed = {
            "title",
            "description",
            "status",
            "status_mode",
            "status_override",
            "status_override_set_at",
            "is_blocked",
            "blocked_reason",
            "priority",
            "metadata_json",
            "updated_by",
            "updated_at",
        }
        sets = []
        params: list[Any] = []
        for k, v in data.items():
            if k in allowed:
                sets.append(k + " = ?")
                if k == "is_blocked":
                    params.append(1 if v else 0)
                else:
                    params.append(v)

        if not sets:
            return await self.get_by_id(epic_id)

        params.append(epic_id)
        await self._db.execute(_build_update_query("epics", sets), params)
        await self._db.commit()
        return await self.get_by_id(epic_id)

    async def delete(self, epic_id: str) -> bool:
        cursor = await self._db.execute("DELETE FROM epics WHERE id = ?", [epic_id])
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def get_story_count(self, epic_id: str) -> int:
        return await _fetch_count(
            self._db,
            "SELECT COUNT(*) FROM stories WHERE epic_id = ?",
            [epic_id],
        )

    async def allocate_key(self, project_id: str) -> str:
        return await _allocate_next_key(self._db, project_id)

    async def project_exists(self, project_id: str) -> bool:
        return await _project_exists(self._db, project_id)
