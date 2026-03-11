import json
from typing import Any
from uuid import uuid4

import aiosqlite

from app.planning.application.ports import (
    ActivityLogRepository,
    AgentRepository,
    BacklogRepository,
    EpicRepository,
    LabelRepository,
    ProjectRepository,
    StoryRepository,
    TaskRepository,
)
from app.planning.domain.models import (
    Agent,
    AgentSource,
    Backlog,
    BacklogKind,
    BacklogStatus,
    BacklogStoryItem,
    BacklogTaskItem,
    Epic,
    EpicOverview,
    EpicStatus,
    ItemStatus,
    Label,
    Project,
    ProjectStatus,
    StatusMode,
    Story,
    Task,
    TaskAssignment,
)
from app.shared.api.errors import ValidationError
from app.shared.utils import utc_now

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SORT_ALLOWED_PROJECT = {"created_at", "updated_at", "name", "key"}
_SORT_ALLOWED_EPIC = {"created_at", "updated_at", "title", "priority", "status"}
_SORT_ALLOWED_EPIC_OVERVIEW = {
    "priority": "priority",
    "progress_pct": "progress_pct",
    "progress_trend_7d": "progress_trend_7d",
    "updated_at": "updated_at",
    "blocked_count": "blocked_count",
}
_SORT_ALLOWED_STORY = {"created_at", "updated_at", "title", "priority", "status"}
_SORT_ALLOWED_AGENT = {"created_at", "updated_at", "name", "openclaw_key"}
_SORT_ALLOWED_BACKLOG = {"created_at", "updated_at", "name", "display_order"}
_SORT_ALLOWED_TASK = {"created_at", "updated_at", "title", "priority", "status"}
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


def _parse_sort(raw: str, allowed: set[str]) -> str:
    clauses: list[str] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if part.startswith("-"):
            field = part[1:]
            direction = "DESC"
        else:
            field = part
            direction = "ASC"
        if field not in allowed:
            raise ValidationError(
                f"Invalid sort field '{field}'. Allowed: {', '.join(sorted(allowed))}"
            )
        clauses.append(field + " " + direction)
    return ", ".join(clauses) if clauses else "created_at DESC"


def _build_list_queries(
    table: str, where_parts: list[str], order_sql: str | None = None
) -> tuple[str, str]:
    """Build COUNT and SELECT queries for list operations."""
    where = (" WHERE " + " AND ".join(where_parts)) if where_parts else ""
    count_q = "SELECT COUNT(*) FROM " + table + where
    select_q = "SELECT * FROM " + table + where
    if order_sql:
        select_q += " ORDER BY " + order_sql
    select_q += " LIMIT ? OFFSET ?"
    return count_q, select_q


def _build_update_query(table: str, sets: list[str]) -> str:
    """Build UPDATE query for partial updates."""
    return "UPDATE " + table + " SET " + ", ".join(sets) + " WHERE id = ?"


def _assignment_payload(agent_id: str | None) -> dict[str, str] | None:
    if agent_id is None:
        return None
    return {"id": agent_id}


async def _insert_assignment_event(
    db: aiosqlite.Connection,
    *,
    actor_id: str | None,
    entity_type: str,
    entity_id: str,
    work_item_key: str | None,
    new_assignee_agent_id: str | None,
    previous_assignee_agent_id: str | None,
    occurred_at: str,
    correlation_id: str,
    causation_id: str,
) -> None:
    await db.execute(
        """
        INSERT INTO activity_log (
          id, event_name, actor_id, actor_type,
          entity_type, entity_id, scope_json, metadata_json,
          occurred_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            str(uuid4()),
            "planning.assignment.changed",
            actor_id,
            "system",
            entity_type,
            entity_id,
            json.dumps(
                {
                    "work_item_key": work_item_key,
                    "correlation_id": correlation_id,
                    "causation_id": causation_id,
                },
                separators=(",", ":"),
                sort_keys=True,
            ),
            json.dumps(
                {
                    "work_item_key": work_item_key,
                    "assignee_agent": _assignment_payload(new_assignee_agent_id),
                    "previous_assignee": _assignment_payload(previous_assignee_agent_id),
                    "correlation_id": correlation_id,
                    "causation_id": causation_id,
                    "timestamp": occurred_at,
                },
                separators=(",", ":"),
                sort_keys=True,
            ),
            occurred_at,
            occurred_at,
        ],
    )


def _parse_sort_mapped(raw: str, allowed: dict[str, str], default_sql: str) -> str:
    clauses: list[str] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if part.startswith("-"):
            field = part[1:]
            direction = "DESC"
        else:
            field = part
            direction = "ASC"
        expr = allowed.get(field)
        if expr is None:
            raise ValidationError(
                f"Invalid sort field '{field}'. Allowed: {', '.join(sorted(allowed.keys()))}"
            )
        clauses.append(expr + " " + direction)
    return ", ".join(clauses) if clauses else default_sql


def _row_to_project(row: aiosqlite.Row) -> Project:
    return Project(
        id=row["id"],
        key=row["key"],
        name=row["name"],
        description=row["description"],
        status=ProjectStatus(row["status"]),
        is_default=bool(row["is_default"]),
        repo_root=row["repo_root"],
        created_by=row["created_by"],
        updated_by=row["updated_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_epic(row: aiosqlite.Row) -> Epic:
    return Epic(
        id=row["id"],
        project_id=row["project_id"],
        key=row["key"],
        title=row["title"],
        description=row["description"],
        status=EpicStatus(row["status"]),
        status_mode=StatusMode(row["status_mode"]),
        status_override=row["status_override"],
        status_override_set_at=row["status_override_set_at"],
        is_blocked=bool(row["is_blocked"]),
        blocked_reason=row["blocked_reason"],
        priority=row["priority"],
        metadata_json=row["metadata_json"],
        created_by=row["created_by"],
        updated_by=row["updated_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_epic_overview(row: aiosqlite.Row) -> EpicOverview:
    return EpicOverview(
        epic_key=row["epic_key"],
        title=row["title"],
        status=EpicStatus(row["status"]),
        progress_pct=float(row["progress_pct"]),
        progress_trend_7d=float(row["progress_trend_7d"]),
        stories_total=int(row["stories_total"]),
        stories_done=int(row["stories_done"]),
        stories_in_progress=int(row["stories_in_progress"]),
        blocked_count=int(row["blocked_count"]),
        stale_days=int(row["stale_days"]),
        priority=row["priority"],
        updated_at=row["updated_at"],
    )


def _row_to_story(row: aiosqlite.Row) -> Story:
    current_assignee_agent_id = (
        row["current_assignee_agent_id"] if "current_assignee_agent_id" in row.keys() else None
    )
    return Story(
        id=row["id"],
        project_id=row["project_id"],
        epic_id=row["epic_id"],
        key=row["key"],
        title=row["title"],
        intent=row["intent"],
        description=row["description"],
        story_type=row["story_type"],
        status=ItemStatus(row["status"]),
        is_blocked=bool(row["is_blocked"]),
        blocked_reason=row["blocked_reason"],
        priority=row["priority"],
        current_assignee_agent_id=current_assignee_agent_id,
        metadata_json=row["metadata_json"],
        created_by=row["created_by"],
        updated_by=row["updated_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
    )


def _row_to_agent(row: aiosqlite.Row) -> Agent:
    avatar = row["avatar"] if "avatar" in row.keys() else None
    last_name = row["last_name"] if "last_name" in row.keys() else None
    initials = row["initials"] if "initials" in row.keys() else None
    return Agent(
        id=row["id"],
        openclaw_key=row["openclaw_key"],
        name=row["name"],
        last_name=last_name,
        initials=initials,
        role=row["role"],
        worker_type=row["worker_type"],
        avatar=avatar,
        is_active=bool(row["is_active"]),
        source=AgentSource(row["source"]),
        metadata_json=row["metadata_json"],
        last_synced_at=row["last_synced_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_label(row: aiosqlite.Row) -> Label:
    return Label(
        id=row["id"],
        project_id=row["project_id"],
        name=row["name"],
        color=row["color"],
        created_at=row["created_at"],
    )


def _row_to_backlog(row: aiosqlite.Row) -> Backlog:
    return Backlog(
        id=row["id"],
        project_id=row["project_id"],
        name=row["name"],
        kind=BacklogKind(row["kind"]),
        status=BacklogStatus(row["status"]),
        display_order=row["display_order"],
        is_default=bool(row["is_default"]),
        goal=row["goal"],
        start_date=row["start_date"],
        end_date=row["end_date"],
        metadata_json=row["metadata_json"],
        created_by=row["created_by"],
        updated_by=row["updated_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_task(row: aiosqlite.Row) -> Task:
    return Task(
        id=row["id"],
        project_id=row["project_id"],
        story_id=row["story_id"],
        key=row["key"],
        title=row["title"],
        objective=row["objective"],
        task_type=row["task_type"],
        status=ItemStatus(row["status"]),
        is_blocked=bool(row["is_blocked"]),
        blocked_reason=row["blocked_reason"],
        priority=row["priority"],
        estimate_points=row["estimate_points"],
        due_at=row["due_at"],
        current_assignee_agent_id=row["current_assignee_agent_id"],
        metadata_json=row["metadata_json"],
        created_by=row["created_by"],
        updated_by=row["updated_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
    )


def _row_to_assignment(row: aiosqlite.Row) -> TaskAssignment:
    return TaskAssignment(
        id=row["id"],
        task_id=row["task_id"],
        agent_id=row["agent_id"],
        assigned_at=row["assigned_at"],
        unassigned_at=row["unassigned_at"],
        assigned_by=row["assigned_by"],
        reason=row["reason"],
    )


async def _fetch_count(db: aiosqlite.Connection, sql: str, params: list[Any]) -> int:
    cursor = await db.execute(sql, params)
    row = await cursor.fetchone()
    return row[0] if row else 0


async def _fetch_one(db: aiosqlite.Connection, sql: str, params: list[Any]) -> aiosqlite.Row | None:
    cursor = await db.execute(sql, params)
    return await cursor.fetchone()


async def _fetch_all(db: aiosqlite.Connection, sql: str, params: list[Any]) -> list[aiosqlite.Row]:
    cursor = await db.execute(sql, params)
    return list(await cursor.fetchall())


async def _exists(db: aiosqlite.Connection, sql: str, params: list[Any]) -> bool:
    cursor = await db.execute(sql, params)
    row = await cursor.fetchone()
    return row is not None


async def _allocate_next_key(db: aiosqlite.Connection, project_id: str) -> str:
    """Allocate the next sequential key for a project.

    Reads the project key prefix and increments the shared counter atomically
    (safe under SQLite's single-writer serialisation).
    """
    row = await _fetch_one(db, "SELECT key FROM projects WHERE id = ?", [project_id])
    if not row:
        raise ValidationError(f"Project {project_id} does not exist")
    project_key = row["key"]

    counter_row = await _fetch_one(
        db,
        "SELECT next_number FROM project_counters WHERE project_id = ?",
        [project_id],
    )
    if not counter_row:
        raise ValidationError(f"No counter found for project {project_id}")

    next_num = counter_row["next_number"]
    await db.execute(
        """UPDATE project_counters
           SET next_number = next_number + 1, updated_at = ?
           WHERE project_id = ?""",
        [utc_now(), project_id],
    )
    await db.commit()
    return f"{project_key}-{next_num}"


async def _project_exists(db: aiosqlite.Connection, project_id: str) -> bool:
    return await _exists(db, "SELECT 1 FROM projects WHERE id = ?", [project_id])


# ---------------------------------------------------------------------------
# Project Repository
# ---------------------------------------------------------------------------


class SqliteProjectRepository(ProjectRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
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


# ---------------------------------------------------------------------------
# Epic Repository
# ---------------------------------------------------------------------------


class SqliteEpicRepository(EpicRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
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
            where_parts.append("(e.title LIKE ? OR e.key LIKE ?)")
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
            "CAST(MAX(0, julianday('now') - julianday(e.updated_at)) AS INTEGER) AS stale_days, "
            "e.priority AS priority, "
            "e.updated_at AS updated_at "
            "FROM epics e "
            "LEFT JOIN ("
            "  SELECT "
            "    s.epic_id AS epic_id, "
            "    COUNT(*) AS stories_total, "
            "    SUM(CASE WHEN s.status = 'DONE' THEN 1 ELSE 0 END) AS stories_done, "
            "    SUM(CASE WHEN s.status = 'DONE' AND s.completed_at IS NOT NULL "
            "             AND s.completed_at >= datetime('now', '-7 days') "
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
        # stories.epic_id uses ON DELETE SET NULL (not CASCADE) because stories
        # are independent entities that can exist without an epic. Deleting an
        # epic orphans its stories rather than destroying them.
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


# ---------------------------------------------------------------------------
# Story Repository
# ---------------------------------------------------------------------------


class SqliteStoryRepository(StoryRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def list_all(
        self,
        *,
        key: str | None = None,
        project_id: str | None = None,
        epic_id: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Story], int]:
        where_parts: list[str] = []
        params: list[Any] = []

        if key:
            where_parts.append("key = ?")
            params.append(key)
        if project_id:
            where_parts.append("project_id = ?")
            params.append(project_id)
        if epic_id:
            where_parts.append("epic_id = ?")
            params.append(epic_id)
        if status:
            where_parts.append("status = ?")
            params.append(status)

        order_sql = _parse_sort(sort, _SORT_ALLOWED_STORY)
        count_q, select_q = _build_list_queries("stories", where_parts, order_sql)

        total = await _fetch_count(self._db, count_q, params)
        rows = await _fetch_all(self._db, select_q, [*params, limit, offset])
        return [_row_to_story(r) for r in rows], total

    async def get_by_id(self, story_id: str) -> Story | None:
        row = await _fetch_one(self._db, "SELECT * FROM stories WHERE id = ?", [story_id])
        return _row_to_story(row) if row else None

    async def get_by_key(self, key: str) -> Story | None:
        row = await _fetch_one(self._db, "SELECT * FROM stories WHERE key = ?", [key.upper()])
        return _row_to_story(row) if row else None

    async def create(self, story: Story) -> Story:
        await self._db.execute(
            """INSERT INTO stories (id, project_id, epic_id, key, title, intent,
               description, story_type, status,
               is_blocked, blocked_reason, priority, current_assignee_agent_id, metadata_json,
               created_by, updated_by, created_at, updated_at,
               started_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                story.id,
                story.project_id,
                story.epic_id,
                story.key,
                story.title,
                story.intent,
                story.description,
                story.story_type,
                story.status,
                1 if story.is_blocked else 0,
                story.blocked_reason,
                story.priority,
                story.current_assignee_agent_id,
                story.metadata_json,
                story.created_by,
                story.updated_by,
                story.created_at,
                story.updated_at,
                story.started_at,
                story.completed_at,
            ],
        )
        await self._db.commit()
        return story

    async def update(self, story_id: str, data: dict[str, Any]) -> Story | None:
        allowed = {
            "title",
            "intent",
            "description",
            "story_type",
            "status",
            "epic_id",
            "is_blocked",
            "blocked_reason",
            "priority",
            "current_assignee_agent_id",
            "metadata_json",
            "updated_by",
            "updated_at",
            "started_at",
            "completed_at",
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
            return await self.get_by_id(story_id)

        params.append(story_id)
        await self._db.execute(_build_update_query("stories", sets), params)
        await self._db.commit()
        return await self.get_by_id(story_id)

    async def update_assignee_with_event(
        self,
        *,
        story_id: str,
        data: dict[str, Any],
        new_assignee_agent_id: str | None,
        previous_assignee_agent_id: str | None,
        actor_id: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> Story | None:
        allowed = {
            "title",
            "intent",
            "description",
            "story_type",
            "status",
            "epic_id",
            "is_blocked",
            "blocked_reason",
            "priority",
            "current_assignee_agent_id",
            "metadata_json",
            "updated_by",
            "updated_at",
            "started_at",
            "completed_at",
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
            return await self.get_by_id(story_id)

        row = await _fetch_one(self._db, "SELECT key FROM stories WHERE id = ?", [story_id])
        if row is None:
            return None

        try:
            await self._db.execute("BEGIN")
            params.append(story_id)
            await self._db.execute(_build_update_query("stories", sets), params)
            await _insert_assignment_event(
                self._db,
                actor_id=actor_id,
                entity_type="story",
                entity_id=story_id,
                work_item_key=row["key"],
                new_assignee_agent_id=new_assignee_agent_id,
                previous_assignee_agent_id=previous_assignee_agent_id,
                occurred_at=occurred_at,
                correlation_id=correlation_id,
                causation_id=causation_id,
            )
            await self._db.commit()
        except Exception:
            await self._db.rollback()
            raise
        return await self.get_by_id(story_id)

    async def delete(self, story_id: str) -> bool:
        cursor = await self._db.execute("DELETE FROM stories WHERE id = ?", [story_id])
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def get_task_count(self, story_id: str) -> int:
        return await _fetch_count(
            self._db,
            "SELECT COUNT(*) FROM tasks WHERE story_id = ?",
            [story_id],
        )

    async def allocate_key(self, project_id: str) -> str:
        return await _allocate_next_key(self._db, project_id)

    async def project_exists(self, project_id: str) -> bool:
        return await _project_exists(self._db, project_id)

    async def epic_exists(self, epic_id: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM epics WHERE id = ?", [epic_id])

    async def label_exists(self, label_id: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM labels WHERE id = ?", [label_id])

    async def attach_label(self, story_id: str, label_id: str) -> None:
        await self._db.execute(
            """INSERT INTO story_labels (story_id, label_id, added_at)
               VALUES (?, ?, ?)""",
            [story_id, label_id, utc_now()],
        )
        await self._db.commit()

    async def detach_label(self, story_id: str, label_id: str) -> bool:
        cursor = await self._db.execute(
            "DELETE FROM story_labels WHERE story_id = ? AND label_id = ?",
            [story_id, label_id],
        )
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def label_attached(self, story_id: str, label_id: str) -> bool:
        return await _exists(
            self._db,
            "SELECT 1 FROM story_labels WHERE story_id = ? AND label_id = ?",
            [story_id, label_id],
        )

    async def agent_exists(self, agent_id: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM agents WHERE id = ?", [agent_id])


# ---------------------------------------------------------------------------
# Agent Repository
# ---------------------------------------------------------------------------


class SqliteAgentRepository(AgentRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def list_all(
        self,
        *,
        openclaw_key: str | None = None,
        is_active: bool | None = None,
        source: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Agent], int]:
        where_parts: list[str] = []
        params: list[Any] = []

        if openclaw_key:
            where_parts.append("openclaw_key = ?")
            params.append(openclaw_key)
        if is_active is not None:
            where_parts.append("is_active = ?")
            params.append(1 if is_active else 0)
        if source:
            where_parts.append("source = ?")
            params.append(source)

        order_sql = _parse_sort(sort, _SORT_ALLOWED_AGENT)
        count_q, select_q = _build_list_queries("agents", where_parts, order_sql)

        total = await _fetch_count(self._db, count_q, params)
        rows = await _fetch_all(self._db, select_q, [*params, limit, offset])
        return [_row_to_agent(r) for r in rows], total

    async def get_by_id(self, agent_id: str) -> Agent | None:
        row = await _fetch_one(self._db, "SELECT * FROM agents WHERE id = ?", [agent_id])
        return _row_to_agent(row) if row else None

    async def get_by_openclaw_key(self, openclaw_key: str) -> Agent | None:
        row = await _fetch_one(
            self._db, "SELECT * FROM agents WHERE openclaw_key = ?", [openclaw_key]
        )
        return _row_to_agent(row) if row else None

    async def list_by_source(self, source: str) -> list[Agent]:
        rows = await _fetch_all(
            self._db,
            "SELECT * FROM agents WHERE source = ? ORDER BY openclaw_key ASC",
            [source],
        )
        return [_row_to_agent(r) for r in rows]

    async def create(self, agent: Agent) -> Agent:
        await self._db.execute(
            """INSERT INTO agents (id, openclaw_key, name, last_name, initials, role, worker_type,
               avatar, is_active, source, metadata_json, last_synced_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                agent.id,
                agent.openclaw_key,
                agent.name,
                agent.last_name,
                agent.initials,
                agent.role,
                agent.worker_type,
                agent.avatar,
                1 if agent.is_active else 0,
                agent.source,
                agent.metadata_json,
                agent.last_synced_at,
                agent.created_at,
                agent.updated_at,
            ],
        )
        await self._db.commit()
        return agent

    async def update(self, agent_id: str, data: dict[str, Any]) -> Agent | None:
        allowed = {
            "name",
            "last_name",
            "initials",
            "role",
            "worker_type",
            "avatar",
            "is_active",
            "source",
            "metadata_json",
            "last_synced_at",
            "updated_at",
        }
        sets = []
        params: list[Any] = []
        for k, v in data.items():
            if k in allowed:
                sets.append(k + " = ?")
                if k == "is_active":
                    params.append(1 if v else 0)
                else:
                    params.append(v)

        if not sets:
            return await self.get_by_id(agent_id)

        params.append(agent_id)
        await self._db.execute(_build_update_query("agents", sets), params)
        await self._db.commit()
        return await self.get_by_id(agent_id)

    async def delete(self, agent_id: str) -> bool:
        cursor = await self._db.execute("DELETE FROM agents WHERE id = ?", [agent_id])
        await self._db.commit()
        return (cursor.rowcount or 0) > 0


# ---------------------------------------------------------------------------
# Label Repository
# ---------------------------------------------------------------------------


class SqliteLabelRepository(LabelRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def list_all(
        self,
        *,
        project_id: str | None = None,
        filter_global: bool = False,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Label], int]:
        where_parts: list[str] = []
        params: list[Any] = []

        if filter_global:
            where_parts.append("project_id IS NULL")
        elif project_id:
            where_parts.append("(project_id = ? OR project_id IS NULL)")
            params.append(project_id)

        count_q, select_q = _build_list_queries("labels", where_parts, "name ASC")

        total = await _fetch_count(self._db, count_q, params)
        rows = await _fetch_all(self._db, select_q, [*params, limit, offset])
        return [_row_to_label(r) for r in rows], total

    async def get_by_id(self, label_id: str) -> Label | None:
        row = await _fetch_one(self._db, "SELECT * FROM labels WHERE id = ?", [label_id])
        return _row_to_label(row) if row else None

    async def name_exists(self, name: str, project_id: str | None) -> bool:
        if project_id:
            return await _exists(
                self._db,
                "SELECT 1 FROM labels WHERE name = ? AND project_id = ?",
                [name, project_id],
            )
        return await _exists(
            self._db,
            "SELECT 1 FROM labels WHERE name = ? AND project_id IS NULL",
            [name],
        )

    async def create(self, label: Label) -> Label:
        await self._db.execute(
            """INSERT INTO labels (id, project_id, name, color, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            [label.id, label.project_id, label.name, label.color, label.created_at],
        )
        await self._db.commit()
        return label

    async def update(self, label_id: str, data: dict[str, Any]) -> Label | None:
        sets: list[str] = []
        params: list[Any] = []

        for field in ("name", "color"):
            if field not in data:
                continue
            sets.append(f"{field} = ?")
            params.append(data[field])

        if not sets:
            return await self.get_by_id(label_id)

        params.append(label_id)
        await self._db.execute(_build_update_query("labels", sets), params)
        await self._db.commit()
        return await self.get_by_id(label_id)

    async def delete(self, label_id: str) -> bool:
        cursor = await self._db.execute("DELETE FROM labels WHERE id = ?", [label_id])
        await self._db.commit()
        return (cursor.rowcount or 0) > 0


# ---------------------------------------------------------------------------
# Backlog Repository
# ---------------------------------------------------------------------------


class SqliteBacklogRepository(BacklogRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

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
        if position is None:
            rows = await _fetch_all(
                self._db,
                "SELECT position FROM backlog_stories WHERE backlog_id = ? ORDER BY position ASC",
                [backlog_id],
            )
            normalized = 0
            for row in rows:
                if row["position"] == normalized:
                    normalized += 1
                elif row["position"] > normalized:
                    break
        else:
            max_position = await _fetch_count(
                self._db,
                "SELECT COUNT(*) FROM backlog_stories WHERE backlog_id = ?",
                [backlog_id],
            )
            normalized = min(position, max_position)
        await self._db.execute(
            """UPDATE backlog_stories
               SET position = position + 1
               WHERE backlog_id = ? AND position >= ?""",
            [backlog_id, normalized],
        )
        added_at = utc_now()
        await self._db.execute(
            """INSERT INTO backlog_stories (backlog_id, story_id, position, added_at)
               VALUES (?, ?, ?, ?)""",
            [backlog_id, story_id, normalized, added_at],
        )
        await self._db.commit()
        return BacklogStoryItem(
            backlog_id=backlog_id,
            story_id=story_id,
            position=normalized,
            added_at=added_at,
        )

    async def remove_story_item(self, backlog_id: str, story_id: str) -> bool:
        row = await _fetch_one(
            self._db,
            "SELECT position FROM backlog_stories WHERE backlog_id = ? AND story_id = ?",
            [backlog_id, story_id],
        )
        if not row:
            return False
        removed_position = row["position"]
        await self._db.execute(
            "DELETE FROM backlog_stories WHERE backlog_id = ? AND story_id = ?",
            [backlog_id, story_id],
        )
        await self._db.execute(
            """UPDATE backlog_stories
               SET position = position - 1
               WHERE backlog_id = ? AND position > ?""",
            [backlog_id, removed_position],
        )
        await self._db.commit()
        return True

    async def move_story_item(
        self,
        *,
        source_backlog_id: str,
        target_backlog_id: str,
        story_id: str,
        target_position: int | None,
    ) -> BacklogStoryItem:
        row = await _fetch_one(
            self._db,
            "SELECT position FROM backlog_stories WHERE backlog_id = ? AND story_id = ?",
            [source_backlog_id, story_id],
        )
        if not row:
            raise ValueError(f"Story {story_id} is not in backlog {source_backlog_id}")

        source_position = row["position"]
        await self._db.execute(
            "DELETE FROM backlog_stories WHERE backlog_id = ? AND story_id = ?",
            [source_backlog_id, story_id],
        )
        await self._db.execute(
            """UPDATE backlog_stories
               SET position = position - 1
               WHERE backlog_id = ? AND position > ?""",
            [source_backlog_id, source_position],
        )

        if target_position is None:
            rows = await _fetch_all(
                self._db,
                "SELECT position FROM backlog_stories WHERE backlog_id = ? ORDER BY position ASC",
                [target_backlog_id],
            )
            normalized = 0
            for target_row in rows:
                if target_row["position"] == normalized:
                    normalized += 1
                elif target_row["position"] > normalized:
                    break
        else:
            max_position = await _fetch_count(
                self._db,
                "SELECT COUNT(*) FROM backlog_stories WHERE backlog_id = ?",
                [target_backlog_id],
            )
            normalized = min(target_position, max_position)

        await self._db.execute(
            """UPDATE backlog_stories
               SET position = position + 1
               WHERE backlog_id = ? AND position >= ?""",
            [target_backlog_id, normalized],
        )
        added_at = utc_now()
        await self._db.execute(
            """INSERT INTO backlog_stories (backlog_id, story_id, position, added_at)
               VALUES (?, ?, ?, ?)""",
            [target_backlog_id, story_id, normalized, added_at],
        )
        await self._db.commit()
        return BacklogStoryItem(
            backlog_id=target_backlog_id,
            story_id=story_id,
            position=normalized,
            added_at=added_at,
        )

    async def add_task_item(self, backlog_id: str, task_id: str, position: int) -> BacklogTaskItem:
        max_position = await _fetch_count(
            self._db,
            "SELECT COUNT(*) FROM backlog_tasks WHERE backlog_id = ?",
            [backlog_id],
        )
        normalized = min(position, max_position)
        await self._db.execute(
            """UPDATE backlog_tasks
               SET position = position + 1
               WHERE backlog_id = ? AND position >= ?""",
            [backlog_id, normalized],
        )
        added_at = utc_now()
        await self._db.execute(
            """INSERT INTO backlog_tasks (backlog_id, task_id, position, added_at)
               VALUES (?, ?, ?, ?)""",
            [backlog_id, task_id, normalized, added_at],
        )
        await self._db.commit()
        return BacklogTaskItem(
            backlog_id=backlog_id,
            task_id=task_id,
            position=normalized,
            added_at=added_at,
        )

    async def remove_task_item(self, backlog_id: str, task_id: str) -> bool:
        row = await _fetch_one(
            self._db,
            "SELECT position FROM backlog_tasks WHERE backlog_id = ? AND task_id = ?",
            [backlog_id, task_id],
        )
        if not row:
            return False
        removed_position = row["position"]
        await self._db.execute(
            "DELETE FROM backlog_tasks WHERE backlog_id = ? AND task_id = ?",
            [backlog_id, task_id],
        )
        await self._db.execute(
            """UPDATE backlog_tasks
               SET position = position - 1
               WHERE backlog_id = ? AND position > ?""",
            [backlog_id, removed_position],
        )
        await self._db.commit()
        return True

    async def reorder_items(
        self,
        backlog_id: str,
        stories: list[dict[str, Any]],
        tasks: list[dict[str, Any]],
    ) -> dict[str, int]:
        for row in stories:
            await self._db.execute(
                """UPDATE backlog_stories
                   SET position = ?
                   WHERE backlog_id = ? AND story_id = ?""",
                [row["position"], backlog_id, row["story_id"]],
            )
        for row in tasks:
            await self._db.execute(
                """UPDATE backlog_tasks
                   SET position = ?
                   WHERE backlog_id = ? AND task_id = ?""",
                [row["position"], backlog_id, row["task_id"]],
            )
        await self._db.commit()
        return {
            "updated_story_count": len(stories),
            "updated_task_count": len(tasks),
        }

    async def list_backlog_stories(self, backlog_id: str) -> list[dict[str, Any]]:
        story_rows = await _fetch_all(
            self._db,
            """SELECT s.id, s.key, s.title, s.status, s.priority, s.story_type,
                      s.current_assignee_agent_id, s.metadata_json,
                      e.key AS epic_key,
                      e.title AS epic_title,
                      bs.position,
                      COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.story_id = s.id), 0)
                        AS task_count,
                      COALESCE(
                        (
                          SELECT COUNT(*)
                          FROM tasks t
                          WHERE t.story_id = s.id AND t.status = 'DONE'
                        ),
                        0
                      ) AS done_task_count
               FROM backlog_stories bs
               JOIN stories s ON s.id = bs.story_id
               LEFT JOIN epics e ON e.id = s.epic_id
               WHERE bs.backlog_id = ?
               ORDER BY bs.position ASC""",
            [backlog_id],
        )
        stories = [dict(r) for r in story_rows]
        await self._attach_story_labels(stories)
        await self._attach_story_assignees(stories)
        return stories

    async def list_task_items(self, backlog_id: str) -> list[BacklogTaskItem]:
        rows = await _fetch_all(
            self._db,
            """SELECT bt.backlog_id, bt.task_id, bt.position, bt.added_at
               FROM backlog_tasks bt
               JOIN tasks t ON t.id = bt.task_id
               WHERE bt.backlog_id = ? AND t.story_id IS NULL
               ORDER BY bt.position ASC""",
            [backlog_id],
        )
        return [
            BacklogTaskItem(
                backlog_id=row["backlog_id"],
                task_id=row["task_id"],
                position=row["position"],
                added_at=row["added_at"],
            )
            for row in rows
        ]

    async def get_active_sprint_with_stories(
        self, project_id: str
    ) -> tuple[Backlog | None, list[dict[str, Any]]]:
        backlog = await self.get_active_sprint_backlog(project_id)
        if not backlog:
            return None, []
        story_rows = await _fetch_all(
            self._db,
            """SELECT s.id, s.key, s.title, s.status, s.priority, s.story_type,
                      s.current_assignee_agent_id, s.metadata_json,
                      e.key AS epic_key,
                      e.title AS epic_title,
                      bs.position,
                      COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.story_id = s.id), 0)
                        AS task_count,
                      COALESCE(
                        (
                          SELECT COUNT(*)
                          FROM tasks t
                          WHERE t.story_id = s.id AND t.status = 'DONE'
                        ),
                        0
                      ) AS done_task_count
               FROM backlog_stories bs
               JOIN stories s ON s.id = bs.story_id
               LEFT JOIN epics e ON e.id = s.epic_id
               WHERE bs.backlog_id = ?
               ORDER BY bs.position ASC""",
            [backlog.id],
        )
        stories = [dict(r) for r in story_rows]
        await self._attach_story_labels(stories)
        await self._attach_story_assignees(stories)
        return backlog, stories

    async def _attach_story_labels(self, stories: list[dict[str, Any]]) -> None:
        if not stories:
            return

        story_ids = [story["id"] for story in stories]
        placeholders = ",".join("?" for _ in story_ids)
        label_rows = await _fetch_all(
            self._db,
            f"""
            SELECT sl.story_id, l.id AS label_id, l.name, l.color
            FROM story_labels sl
            JOIN labels l ON l.id = sl.label_id
            WHERE sl.story_id IN ({placeholders})
            ORDER BY l.name ASC, l.id ASC
            """,
            story_ids,
        )

        labels_by_story: dict[str, list[dict[str, Any]]] = {story_id: [] for story_id in story_ids}
        for row in label_rows:
            labels_by_story[row["story_id"]].append(
                {
                    "id": row["label_id"],
                    "name": row["name"],
                    "color": row["color"],
                }
            )

        for story in stories:
            story_labels = labels_by_story.get(story["id"], [])
            story["labels"] = story_labels
            story["label_ids"] = [label["id"] for label in story_labels]

    async def _attach_story_assignees(self, stories: list[dict[str, Any]]) -> None:
        if not stories:
            return

        assignee_ids: set[str] = set()
        assignee_by_story_id: dict[str, str] = {}

        for story in stories:
            direct_assignee = story.get("current_assignee_agent_id")
            if isinstance(direct_assignee, str) and direct_assignee.strip() != "":
                assignee_id = direct_assignee.strip()
                assignee_ids.add(assignee_id)
                assignee_by_story_id[story["id"]] = assignee_id
                continue

            # Backward-compatible fallback for legacy records created before
            # story-level assignee column existed.
            metadata_raw = story.get("metadata_json")
            if not isinstance(metadata_raw, str) or metadata_raw.strip() == "":
                continue
            try:
                metadata = json.loads(metadata_raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(metadata, dict):
                continue
            quick_create_assignee = metadata.get("quick_create_assignee_agent_id")
            if not isinstance(quick_create_assignee, str):
                continue
            assignee_id = quick_create_assignee.strip()
            if assignee_id == "":
                continue
            assignee_ids.add(assignee_id)
            assignee_by_story_id[story["id"]] = assignee_id

        agents_by_id: dict[str, dict[str, Any]] = {}
        if assignee_ids:
            placeholders = ", ".join(["?"] * len(assignee_ids))
            rows = await _fetch_all(
                self._db,
                (
                    "SELECT id, name, last_name, initials, avatar "
                    "FROM agents "
                    f"WHERE id IN ({placeholders}) AND is_active = 1"
                ),
                list(assignee_ids),
            )
            agents_by_id = {
                row["id"]: {
                    "name": row["name"],
                    "last_name": row["last_name"],
                    "initials": row["initials"],
                    "avatar": row["avatar"],
                }
                for row in rows
            }

        for story in stories:
            assignee_id = assignee_by_story_id.get(story["id"])
            if not assignee_id:
                story["assignee_agent_id"] = None
                story["assignee_name"] = None
                story["assignee_last_name"] = None
                story["assignee_initials"] = None
                story["assignee_avatar"] = None
                continue

            agent = agents_by_id.get(assignee_id)
            story["assignee_agent_id"] = assignee_id
            story["assignee_name"] = agent["name"] if agent else None
            story["assignee_last_name"] = agent["last_name"] if agent else None
            story["assignee_initials"] = agent["initials"] if agent else None
            story["assignee_avatar"] = agent["avatar"] if agent else None

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


# ---------------------------------------------------------------------------
# Task Repository
# ---------------------------------------------------------------------------


class SqliteActivityLogRepository(ActivityLogRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def log_event(
        self,
        *,
        event_name: str,
        actor_id: str | None,
        actor_type: str | None,
        entity_type: str,
        entity_id: str,
        scope: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        occurred_at: str,
    ) -> None:
        event_id = str(uuid4())
        scope_json = json.dumps(scope) if scope is not None else None
        metadata_json = json.dumps(metadata) if metadata is not None else None
        await self._db.execute(
            """
            INSERT INTO activity_log (
              id, event_name, actor_id, actor_type,
              entity_type, entity_id, scope_json, metadata_json,
              occurred_at, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                event_id,
                event_name,
                actor_id,
                actor_type,
                entity_type,
                entity_id,
                scope_json,
                metadata_json,
                occurred_at,
                occurred_at,
            ],
        )
        await self._db.commit()


class SqliteTaskRepository(TaskRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def list_all(
        self,
        *,
        key: str | None = None,
        project_id: str | None = None,
        story_id: str | None = None,
        epic_id: str | None = None,
        status: str | None = None,
        assignee_id: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Task], int]:
        where_parts: list[str] = []
        params: list[Any] = []

        if key:
            where_parts.append("key = ?")
            params.append(key)
        if project_id:
            where_parts.append("project_id = ?")
            params.append(project_id)
        if story_id:
            where_parts.append("story_id = ?")
            params.append(story_id)
        if epic_id:
            where_parts.append("story_id IN (SELECT id FROM stories WHERE epic_id = ?)")
            params.append(epic_id)
        if status:
            where_parts.append("status = ?")
            params.append(status)
        if assignee_id:
            where_parts.append("current_assignee_agent_id = ?")
            params.append(assignee_id)

        order_sql = _parse_sort(sort, _SORT_ALLOWED_TASK)
        count_q, select_q = _build_list_queries("tasks", where_parts, order_sql)

        total = await _fetch_count(self._db, count_q, params)
        rows = await _fetch_all(self._db, select_q, [*params, limit, offset])
        return [_row_to_task(r) for r in rows], total

    async def get_by_id(self, task_id: str) -> Task | None:
        row = await _fetch_one(self._db, "SELECT * FROM tasks WHERE id = ?", [task_id])
        return _row_to_task(row) if row else None

    async def get_by_key(self, key: str) -> Task | None:
        row = await _fetch_one(self._db, "SELECT * FROM tasks WHERE key = ?", [key.upper()])
        return _row_to_task(row) if row else None

    async def create(self, task: Task) -> Task:
        await self._db.execute(
            """INSERT INTO tasks (id, project_id, story_id, key, title, objective,
               task_type, status, is_blocked, blocked_reason, priority,
               estimate_points, due_at, current_assignee_agent_id,
               metadata_json, created_by, updated_by, created_at, updated_at,
               started_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                task.id,
                task.project_id,
                task.story_id,
                task.key,
                task.title,
                task.objective,
                task.task_type,
                task.status,
                1 if task.is_blocked else 0,
                task.blocked_reason,
                task.priority,
                task.estimate_points,
                task.due_at,
                task.current_assignee_agent_id,
                task.metadata_json,
                task.created_by,
                task.updated_by,
                task.created_at,
                task.updated_at,
                task.started_at,
                task.completed_at,
            ],
        )
        await self._db.commit()
        return task

    async def update(self, task_id: str, data: dict[str, Any]) -> Task | None:
        allowed = {
            "title",
            "objective",
            "task_type",
            "status",
            "story_id",
            "is_blocked",
            "blocked_reason",
            "priority",
            "estimate_points",
            "due_at",
            "current_assignee_agent_id",
            "metadata_json",
            "updated_by",
            "updated_at",
            "started_at",
            "completed_at",
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
            return await self.get_by_id(task_id)

        params.append(task_id)
        await self._db.execute(_build_update_query("tasks", sets), params)
        await self._db.commit()
        return await self.get_by_id(task_id)

    async def update_assignee_with_event(
        self,
        *,
        task_id: str,
        data: dict[str, Any],
        new_assignee_agent_id: str | None,
        previous_assignee_agent_id: str | None,
        actor_id: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> Task | None:
        allowed = {
            "title",
            "objective",
            "task_type",
            "status",
            "story_id",
            "is_blocked",
            "blocked_reason",
            "priority",
            "estimate_points",
            "due_at",
            "current_assignee_agent_id",
            "metadata_json",
            "updated_by",
            "updated_at",
            "started_at",
            "completed_at",
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
            return await self.get_by_id(task_id)

        row = await _fetch_one(self._db, "SELECT key FROM tasks WHERE id = ?", [task_id])
        if row is None:
            return None

        try:
            await self._db.execute("BEGIN")
            params.append(task_id)
            await self._db.execute(_build_update_query("tasks", sets), params)
            await _insert_assignment_event(
                self._db,
                actor_id=actor_id,
                entity_type="task",
                entity_id=task_id,
                work_item_key=row["key"],
                new_assignee_agent_id=new_assignee_agent_id,
                previous_assignee_agent_id=previous_assignee_agent_id,
                occurred_at=occurred_at,
                correlation_id=correlation_id,
                causation_id=causation_id,
            )
            await self._db.commit()
        except Exception:
            await self._db.rollback()
            raise
        return await self.get_by_id(task_id)

    async def delete(self, task_id: str) -> bool:
        cursor = await self._db.execute("DELETE FROM tasks WHERE id = ?", [task_id])
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def allocate_key(self, project_id: str) -> str:
        return await _allocate_next_key(self._db, project_id)

    async def project_exists(self, project_id: str) -> bool:
        return await _project_exists(self._db, project_id)

    async def story_exists(self, story_id: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM stories WHERE id = ?", [story_id])

    async def get_story_project_id(self, story_id: str) -> tuple[bool, str | None]:
        row = await _fetch_one(self._db, "SELECT project_id FROM stories WHERE id = ?", [story_id])
        if not row:
            return False, None
        return True, row["project_id"]

    async def get_story_task_progress(self, story_id: str) -> tuple[int, int]:
        row = await _fetch_one(
            self._db,
            """
            SELECT
              COUNT(*) AS task_count,
              SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) AS done_task_count
            FROM tasks
            WHERE story_id = ?
            """,
            [story_id],
        )
        if not row:
            return 0, 0
        return row["task_count"] or 0, row["done_task_count"] or 0

    async def agent_exists(self, agent_id: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM agents WHERE id = ?", [agent_id])

    async def label_exists(self, label_id: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM labels WHERE id = ?", [label_id])

    async def label_attached(self, task_id: str, label_id: str) -> bool:
        return await _exists(
            self._db,
            "SELECT 1 FROM task_labels WHERE task_id = ? AND label_id = ?",
            [task_id, label_id],
        )

    async def attach_label(self, task_id: str, label_id: str) -> None:
        await self._db.execute(
            """INSERT INTO task_labels (task_id, label_id, added_at)
               VALUES (?, ?, ?)""",
            [task_id, label_id, utc_now()],
        )
        await self._db.commit()

    async def detach_label(self, task_id: str, label_id: str) -> bool:
        cursor = await self._db.execute(
            "DELETE FROM task_labels WHERE task_id = ? AND label_id = ?",
            [task_id, label_id],
        )
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def get_active_assignment(self, task_id: str) -> TaskAssignment | None:
        row = await _fetch_one(
            self._db,
            "SELECT * FROM task_assignments WHERE task_id = ? AND unassigned_at IS NULL",
            [task_id],
        )
        return _row_to_assignment(row) if row else None

    async def get_assignments(self, task_id: str) -> list[TaskAssignment]:
        rows = await _fetch_all(
            self._db,
            "SELECT * FROM task_assignments WHERE task_id = ? ORDER BY assigned_at DESC",
            [task_id],
        )
        return [_row_to_assignment(r) for r in rows]

    async def create_assignment(self, assignment: TaskAssignment) -> TaskAssignment:
        await self._db.execute(
            """INSERT INTO task_assignments (id, task_id, agent_id, assigned_at,
               unassigned_at, assigned_by, reason)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [
                assignment.id,
                assignment.task_id,
                assignment.agent_id,
                assignment.assigned_at,
                assignment.unassigned_at,
                assignment.assigned_by,
                assignment.reason,
            ],
        )
        await self._db.commit()
        return assignment

    async def close_assignment(self, task_id: str, unassigned_at: str) -> bool:
        cursor = await self._db.execute(
            """UPDATE task_assignments
               SET unassigned_at = ?
               WHERE task_id = ? AND unassigned_at IS NULL""",
            [unassigned_at, task_id],
        )
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def assign_agent_with_event(
        self,
        *,
        task_id: str,
        agent_id: str,
        previous_assignee_agent_id: str | None,
        assigned_by: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> TaskAssignment:
        row = await _fetch_one(self._db, "SELECT key FROM tasks WHERE id = ?", [task_id])
        if row is None:
            raise ValidationError(f"Task {task_id} not found")

        assignment = TaskAssignment(
            id=str(uuid4()),
            task_id=task_id,
            agent_id=agent_id,
            assigned_at=occurred_at,
            unassigned_at=None,
            assigned_by=assigned_by,
            reason=None,
        )
        try:
            await self._db.execute("BEGIN")
            if previous_assignee_agent_id is not None:
                await self._db.execute(
                    """UPDATE task_assignments
                       SET unassigned_at = ?
                       WHERE task_id = ? AND unassigned_at IS NULL""",
                    [occurred_at, task_id],
                )
            await self._db.execute(
                """INSERT INTO task_assignments (id, task_id, agent_id, assigned_at,
                   unassigned_at, assigned_by, reason)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                [
                    assignment.id,
                    assignment.task_id,
                    assignment.agent_id,
                    assignment.assigned_at,
                    assignment.unassigned_at,
                    assignment.assigned_by,
                    assignment.reason,
                ],
            )
            await self._db.execute(
                "UPDATE tasks SET current_assignee_agent_id = ?, updated_at = ? WHERE id = ?",
                [agent_id, occurred_at, task_id],
            )
            await _insert_assignment_event(
                self._db,
                actor_id=assigned_by,
                entity_type="task",
                entity_id=task_id,
                work_item_key=row["key"],
                new_assignee_agent_id=agent_id,
                previous_assignee_agent_id=previous_assignee_agent_id,
                occurred_at=occurred_at,
                correlation_id=correlation_id,
                causation_id=causation_id,
            )
            await self._db.commit()
        except Exception:
            await self._db.rollback()
            raise
        return assignment

    async def unassign_agent_with_event(
        self,
        *,
        task_id: str,
        previous_assignee_agent_id: str,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> bool:
        row = await _fetch_one(self._db, "SELECT key FROM tasks WHERE id = ?", [task_id])
        if row is None:
            return False
        try:
            await self._db.execute("BEGIN")
            cursor = await self._db.execute(
                """UPDATE task_assignments
                   SET unassigned_at = ?
                   WHERE task_id = ? AND unassigned_at IS NULL""",
                [occurred_at, task_id],
            )
            await self._db.execute(
                "UPDATE tasks SET current_assignee_agent_id = NULL, updated_at = ? WHERE id = ?",
                [occurred_at, task_id],
            )
            await _insert_assignment_event(
                self._db,
                actor_id=None,
                entity_type="task",
                entity_id=task_id,
                work_item_key=row["key"],
                new_assignee_agent_id=None,
                previous_assignee_agent_id=previous_assignee_agent_id,
                occurred_at=occurred_at,
                correlation_id=correlation_id,
                causation_id=causation_id,
            )
            await self._db.commit()
        except Exception:
            await self._db.rollback()
            raise
        return (cursor.rowcount or 0) > 0
