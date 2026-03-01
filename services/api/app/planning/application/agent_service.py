from typing import Any

from app.planning.application.ports import AgentRepository
from app.planning.domain.models import Agent, AgentSource
from app.shared.api.errors import NotFoundError
from app.shared.utils import new_uuid, utc_now


class AgentService:
    def __init__(self, repo: AgentRepository) -> None:
        self._repo = repo

    async def list_agents(
        self,
        *,
        key: str | None = None,
        is_active: bool | None = None,
        source: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Agent], int]:
        return await self._repo.list_all(
            key=key, is_active=is_active, source=source, limit=limit, offset=offset, sort=sort
        )

    async def get_agent(self, agent_id: str) -> Agent:
        agent = await self._repo.get_by_id(agent_id)
        if not agent:
            raise NotFoundError(f"Agent {agent_id} not found")
        return agent

    async def create_agent(
        self,
        *,
        openclaw_key: str,
        name: str,
        role: str | None = None,
        worker_type: str | None = None,
        is_active: bool = True,
        source: AgentSource = AgentSource.MANUAL,
        metadata_json: str | None = None,
    ) -> Agent:
        now = utc_now()
        agent = Agent(
            id=new_uuid(),
            openclaw_key=openclaw_key,
            name=name,
            role=role,
            worker_type=worker_type,
            is_active=is_active,
            source=source,
            metadata_json=metadata_json,
            last_synced_at=None,
            created_at=now,
            updated_at=now,
        )
        return await self._repo.create(agent)

    async def update_agent(self, agent_id: str, data: dict[str, Any]) -> Agent:
        existing = await self._repo.get_by_id(agent_id)
        if not existing:
            raise NotFoundError(f"Agent {agent_id} not found")

        data["updated_at"] = utc_now()
        updated = await self._repo.update(agent_id, data)
        if not updated:
            raise NotFoundError(f"Agent {agent_id} not found")
        return updated

    async def delete_agent(self, agent_id: str) -> None:
        existing = await self._repo.get_by_id(agent_id)
        if not existing:
            raise NotFoundError(f"Agent {agent_id} not found")
        await self._repo.delete(agent_id)
