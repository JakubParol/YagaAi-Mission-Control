from typing import Any

from app.planning.application.ports import AgentRepository
from app.planning.domain.models import Agent
from app.planning.infrastructure.shared.mappers import _row_to_agent
from app.planning.infrastructure.shared.sql import (
    DbConnection,
    _build_list_queries,
    _build_update_query,
    _fetch_all,
    _fetch_count,
    _fetch_one,
    _parse_sort,
)

_SORT_ALLOWED_AGENT = {"created_at", "updated_at", "name", "openclaw_key"}


class DbAgentRepository(AgentRepository):
    def __init__(self, db: DbConnection) -> None:
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
