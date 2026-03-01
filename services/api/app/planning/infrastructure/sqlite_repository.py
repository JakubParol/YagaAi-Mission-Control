from typing import Any

import aiosqlite

from app.planning.application.ports import (
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
_SORT_ALLOWED_STORY = {"created_at", "updated_at", "title", "priority", "status"}
_SORT_ALLOWED_AGENT = {"created_at", "updated_at", "name", "openclaw_key"}
_SORT_ALLOWED_BACKLOG = {"created_at", "updated_at", "name"}
_SORT_ALLOWED_TASK = {"created_at", "updated_at", "title", "priority", "status"}


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


def _row_to_project(row: aiosqlite.Row) -> Project:
    return Project(
        id=row["id"],
        key=row["key"],
        name=row["name"],
        description=row["description"],
        status=ProjectStatus(row["status"]),
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


def _row_to_story(row: aiosqlite.Row) -> Story:
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
        metadata_json=row["metadata_json"],
        created_by=row["created_by"],
        updated_by=row["updated_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
    )


def _row_to_agent(row: aiosqlite.Row) -> Agent:
    return Agent(
        id=row["id"],
        openclaw_key=row["openclaw_key"],
        name=row["name"],
        role=row["role"],
        worker_type=row["worker_type"],
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
        await self._db.execute(
            """INSERT INTO projects (id, key, name, description, status, repo_root,
               created_by, updated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                project.id,
                project.key,
                project.name,
                project.description,
                project.status,
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
        allowed = {"name", "description", "status", "repo_root", "updated_by", "updated_at"}
        sets = []
        params: list[Any] = []
        for k, v in data.items():
            if k in allowed:
                sets.append(k + " = ?")
                params.append(v)

        if not sets:
            return await self.get_by_id(project_id)

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
               is_blocked, blocked_reason, priority, metadata_json,
               created_by, updated_by, created_at, updated_at,
               started_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
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


# ---------------------------------------------------------------------------
# Agent Repository
# ---------------------------------------------------------------------------


class SqliteAgentRepository(AgentRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def list_all(
        self,
        *,
        key: str | None = None,
        is_active: bool | None = None,
        source: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Agent], int]:
        where_parts: list[str] = []
        params: list[Any] = []

        if key:
            where_parts.append("openclaw_key = ?")
            params.append(key)
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

    async def create(self, agent: Agent) -> Agent:
        await self._db.execute(
            """INSERT INTO agents (id, openclaw_key, name, role, worker_type,
               is_active, source, metadata_json, last_synced_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                agent.id,
                agent.openclaw_key,
                agent.name,
                agent.role,
                agent.worker_type,
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
            "role",
            "worker_type",
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
        sort: str = "-created_at",
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

        order_sql = _parse_sort(sort, _SORT_ALLOWED_BACKLOG)
        count_q, select_q = _build_list_queries("backlogs", where_parts, order_sql)

        total = await _fetch_count(self._db, count_q, params)
        rows = await _fetch_all(self._db, select_q, [*params, limit, offset])
        return [_row_to_backlog(r) for r in rows], total

    async def get_by_id(self, backlog_id: str) -> Backlog | None:
        row = await _fetch_one(self._db, "SELECT * FROM backlogs WHERE id = ?", [backlog_id])
        return _row_to_backlog(row) if row else None

    async def create(self, backlog: Backlog) -> Backlog:
        await self._db.execute(
            """INSERT INTO backlogs (id, project_id, name, kind, status, is_default,
               goal, start_date, end_date, metadata_json,
               created_by, updated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                backlog.id,
                backlog.project_id,
                backlog.name,
                backlog.kind,
                backlog.status,
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

    async def update(self, backlog_id: str, data: dict[str, Any]) -> Backlog | None:
        allowed = {
            "name",
            "status",
            "goal",
            "start_date",
            "end_date",
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

    async def task_backlog_id(self, task_id: str) -> str | None:
        row = await _fetch_one(
            self._db,
            "SELECT backlog_id FROM backlog_tasks WHERE task_id = ?",
            [task_id],
        )
        return row["backlog_id"] if row else None

    async def add_story_item(
        self, backlog_id: str, story_id: str, position: int
    ) -> BacklogStoryItem:
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

    async def get_active_sprint_with_stories(
        self, project_id: str
    ) -> tuple[Backlog | None, list[dict[str, Any]]]:
        row = await _fetch_one(
            self._db,
            "SELECT * FROM backlogs WHERE project_id = ? "
            "AND kind = 'SPRINT' AND status = 'ACTIVE' LIMIT 1",
            [project_id],
        )
        if not row:
            return None, []
        backlog = _row_to_backlog(row)
        story_rows = await _fetch_all(
            self._db,
            """SELECT s.id, s.key, s.title, s.status, s.priority, s.story_type,
                      bs.position,
                      COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.story_id = s.id), 0) AS task_count,
                      COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.story_id = s.id AND t.status = 'DONE'), 0) AS done_task_count
               FROM backlog_stories bs
               JOIN stories s ON s.id = bs.story_id
               WHERE bs.backlog_id = ?
               ORDER BY bs.position ASC""",
            [backlog.id],
        )
        stories = [dict(r) for r in story_rows]
        return backlog, stories


# ---------------------------------------------------------------------------
# Task Repository
# ---------------------------------------------------------------------------


class SqliteTaskRepository(TaskRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def list_all(
        self,
        *,
        key: str | None = None,
        project_id: str | None = None,
        story_id: str | None = None,
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
