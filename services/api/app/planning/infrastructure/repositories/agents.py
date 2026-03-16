from typing import Any
from typing import cast as type_cast

from sqlalchemy import delete, insert, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.functions import count

from app.planning.application.ports import AgentRepository
from app.planning.domain.models import Agent
from app.planning.infrastructure.shared.mappers import _row_to_agent
from app.planning.infrastructure.shared.sorting import parse_sort
from app.planning.infrastructure.tables import agents

_SORT_ALLOWED_AGENT = {
    "created_at": agents.c.created_at,
    "updated_at": agents.c.updated_at,
    "name": agents.c.name,
    "openclaw_key": agents.c.openclaw_key,
}


class DbAgentRepository(AgentRepository):
    def __init__(self, db: AsyncSession) -> None:
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
        conditions = []
        if openclaw_key:
            conditions.append(agents.c.openclaw_key == openclaw_key)
        if is_active is not None:
            conditions.append(agents.c.is_active == (1 if is_active else 0))
        if source:
            conditions.append(agents.c.source == source)

        order = parse_sort(sort, _SORT_ALLOWED_AGENT)
        if not order:
            order = [agents.c.created_at.desc()]

        count_q = select(count()).select_from(agents)
        select_q = select(agents)
        for cond in conditions:
            count_q = count_q.where(cond)
            select_q = select_q.where(cond)
        select_q = select_q.order_by(*order).limit(limit).offset(offset)

        total = (await self._db.execute(count_q)).scalar_one()
        rows = (await self._db.execute(select_q)).mappings().all()
        return [_row_to_agent(r) for r in rows], total

    async def get_by_id(self, agent_id: str) -> Agent | None:
        row = (
            (await self._db.execute(select(agents).where(agents.c.id == agent_id)))
            .mappings()
            .first()
        )
        return _row_to_agent(row) if row else None

    async def get_by_openclaw_key(self, openclaw_key: str) -> Agent | None:
        row = (
            (await self._db.execute(select(agents).where(agents.c.openclaw_key == openclaw_key)))
            .mappings()
            .first()
        )
        return _row_to_agent(row) if row else None

    async def list_by_source(self, source: str) -> list[Agent]:
        rows = (
            (
                await self._db.execute(
                    select(agents)
                    .where(agents.c.source == source)
                    .order_by(agents.c.openclaw_key.asc())
                )
            )
            .mappings()
            .all()
        )
        return [_row_to_agent(r) for r in rows]

    async def create(self, agent: Agent) -> Agent:
        await self._db.execute(
            insert(agents).values(
                id=agent.id,
                openclaw_key=agent.openclaw_key,
                name=agent.name,
                last_name=agent.last_name,
                initials=agent.initials,
                role=agent.role,
                worker_type=agent.worker_type,
                avatar=agent.avatar,
                is_active=1 if agent.is_active else 0,
                source=agent.source,
                metadata_json=agent.metadata_json,
                last_synced_at=agent.last_synced_at,
                created_at=agent.created_at,
                updated_at=agent.updated_at,
            )
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
        values = {k: v for k, v in data.items() if k in allowed}
        if not values:
            return await self.get_by_id(agent_id)

        if "is_active" in values:
            values["is_active"] = 1 if values["is_active"] else 0

        await self._db.execute(update(agents).where(agents.c.id == agent_id).values(**values))
        await self._db.commit()
        return await self.get_by_id(agent_id)

    async def delete(self, agent_id: str) -> bool:
        result = type_cast(
            CursorResult, await self._db.execute(delete(agents).where(agents.c.id == agent_id))
        )
        await self._db.commit()
        return (result.rowcount or 0) > 0
