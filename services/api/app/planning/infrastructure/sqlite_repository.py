from datetime import datetime, timezone
from typing import Any

import aiosqlite

from app.planning.application.ports import (
    AgentRepository,
    BacklogRepository,
    LabelRepository,
    ProjectRepository,
)
from app.planning.domain.models import Agent, Backlog, Label, Project

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SORT_ALLOWED_PROJECT = {"created_at", "updated_at", "name", "key"}
_SORT_ALLOWED_AGENT = {"created_at", "updated_at", "name", "openclaw_key"}
_SORT_ALLOWED_BACKLOG = {"created_at", "updated_at", "name"}


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
        if field in allowed:
            clauses.append(f"{field} {direction}")
    return ", ".join(clauses) if clauses else "created_at DESC"


def _row_to_project(row: aiosqlite.Row) -> Project:
    return Project(
        id=row["id"],
        key=row["key"],
        name=row["name"],
        description=row["description"],
        status=row["status"],
        created_by=row["created_by"],
        updated_by=row["updated_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_agent(row: aiosqlite.Row) -> Agent:
    return Agent(
        id=row["id"],
        openclaw_key=row["openclaw_key"],
        name=row["name"],
        role=row["role"],
        worker_type=row["worker_type"],
        is_active=bool(row["is_active"]),
        source=row["source"],
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
        kind=row["kind"],
        status=row["status"],
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


# ---------------------------------------------------------------------------
# Project Repository
# ---------------------------------------------------------------------------


class SqliteProjectRepository(ProjectRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def list(
        self,
        *,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Project], int]:
        where_parts: list[str] = []
        params: list[Any] = []

        if status:
            where_parts.append("status = ?")
            params.append(status)

        where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
        order_sql = _parse_sort(sort, _SORT_ALLOWED_PROJECT)

        total = await _fetch_count(
            self._db,
            f"SELECT COUNT(*) FROM projects {where_sql}",  # nosec B608
            params,
        )
        rows = await _fetch_all(
            self._db,
            f"SELECT * FROM projects {where_sql} "  # nosec B608
            f"ORDER BY {order_sql} LIMIT ? OFFSET ?",
            [*params, limit, offset],
        )
        return [_row_to_project(r) for r in rows], total

    async def get_by_id(self, project_id: str) -> Project | None:
        row = await _fetch_one(self._db, "SELECT * FROM projects WHERE id = ?", [project_id])
        return _row_to_project(row) if row else None

    async def key_exists(self, key: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM projects WHERE key = ?", [key.upper()])

    async def create(self, project: Project) -> Project:
        await self._db.execute(
            """INSERT INTO projects (id, key, name, description, status,
               created_by, updated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                project.id,
                project.key,
                project.name,
                project.description,
                project.status,
                project.created_by,
                project.updated_by,
                project.created_at,
                project.updated_at,
            ],
        )
        await self._db.commit()
        return project

    async def update(self, project_id: str, data: dict) -> Project | None:
        allowed = {"name", "description", "status", "updated_by", "updated_at"}
        sets = []
        params: list[Any] = []
        for k, v in data.items():
            if k in allowed:
                sets.append(f"{k} = ?")
                params.append(v)

        if not sets:
            return await self.get_by_id(project_id)

        params.append(project_id)
        await self._db.execute(
            f"UPDATE projects SET {', '.join(sets)} WHERE id = ?",  # nosec B608
            params,
        )
        await self._db.commit()
        return await self.get_by_id(project_id)

    async def delete(self, project_id: str) -> bool:
        cursor = await self._db.execute("DELETE FROM projects WHERE id = ?", [project_id])
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def create_project_counter(self, project_id: str) -> None:
        now_str = datetime.now(timezone.utc).isoformat()
        await self._db.execute(
            """INSERT OR IGNORE INTO project_counters (project_id, next_number, updated_at)
               VALUES (?, 1, ?)""",
            [project_id, now_str],
        )
        await self._db.commit()


# ---------------------------------------------------------------------------
# Agent Repository
# ---------------------------------------------------------------------------


class SqliteAgentRepository(AgentRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def list(
        self,
        *,
        is_active: bool | None = None,
        source: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Agent], int]:
        where_parts: list[str] = []
        params: list[Any] = []

        if is_active is not None:
            where_parts.append("is_active = ?")
            params.append(1 if is_active else 0)
        if source:
            where_parts.append("source = ?")
            params.append(source)

        where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
        order_sql = _parse_sort(sort, _SORT_ALLOWED_AGENT)

        total = await _fetch_count(
            self._db,
            f"SELECT COUNT(*) FROM agents {where_sql}",  # nosec B608
            params,
        )
        rows = await _fetch_all(
            self._db,
            f"SELECT * FROM agents {where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",  # nosec B608
            [*params, limit, offset],
        )
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

    async def update(self, agent_id: str, data: dict) -> Agent | None:
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
                sets.append(f"{k} = ?")
                if k == "is_active":
                    params.append(1 if v else 0)
                else:
                    params.append(v)

        if not sets:
            return await self.get_by_id(agent_id)

        params.append(agent_id)
        await self._db.execute(
            f"UPDATE agents SET {', '.join(sets)} WHERE id = ?",  # nosec B608
            params,
        )
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

    async def list(
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

        where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

        total = await _fetch_count(
            self._db,
            f"SELECT COUNT(*) FROM labels {where_sql}",  # nosec B608
            params,
        )
        rows = await _fetch_all(
            self._db,
            f"SELECT * FROM labels {where_sql} ORDER BY name ASC LIMIT ? OFFSET ?",  # nosec B608
            [*params, limit, offset],
        )
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
        await self._db.execute("DELETE FROM story_labels WHERE label_id = ?", [label_id])
        await self._db.execute("DELETE FROM task_labels WHERE label_id = ?", [label_id])
        cursor = await self._db.execute("DELETE FROM labels WHERE id = ?", [label_id])
        await self._db.commit()
        return (cursor.rowcount or 0) > 0


# ---------------------------------------------------------------------------
# Backlog Repository
# ---------------------------------------------------------------------------


class SqliteBacklogRepository(BacklogRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def list(
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

        where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
        order_sql = _parse_sort(sort, _SORT_ALLOWED_BACKLOG)

        total = await _fetch_count(
            self._db,
            f"SELECT COUNT(*) FROM backlogs {where_sql}",  # nosec B608
            params,
        )
        rows = await _fetch_all(
            self._db,
            f"SELECT * FROM backlogs {where_sql} "  # nosec B608
            f"ORDER BY {order_sql} LIMIT ? OFFSET ?",
            [*params, limit, offset],
        )
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

    async def update(self, backlog_id: str, data: dict) -> Backlog | None:
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
                sets.append(f"{k} = ?")
                params.append(v)

        if not sets:
            return await self.get_by_id(backlog_id)

        params.append(backlog_id)
        await self._db.execute(
            f"UPDATE backlogs SET {', '.join(sets)} WHERE id = ?",  # nosec B608
            params,
        )
        await self._db.commit()
        return await self.get_by_id(backlog_id)

    async def delete(self, backlog_id: str) -> bool:
        await self._db.execute("DELETE FROM backlog_stories WHERE backlog_id = ?", [backlog_id])
        await self._db.execute("DELETE FROM backlog_tasks WHERE backlog_id = ?", [backlog_id])
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
