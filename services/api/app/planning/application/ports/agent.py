from abc import ABC, abstractmethod
from typing import Any

from app.planning.domain.models import Agent


class AgentRepository(ABC):
    @abstractmethod
    async def list_all(
        self,
        *,
        openclaw_key: str | None = None,
        is_active: bool | None = None,
        source: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Agent], int]: ...

    @abstractmethod
    async def get_by_id(self, agent_id: str) -> Agent | None: ...

    @abstractmethod
    async def get_by_openclaw_key(self, openclaw_key: str) -> Agent | None: ...

    @abstractmethod
    async def list_by_source(self, source: str) -> list[Agent]: ...

    @abstractmethod
    async def create(self, agent: Agent) -> Agent: ...

    @abstractmethod
    async def update(self, agent_id: str, data: dict[str, Any]) -> Agent | None: ...

    @abstractmethod
    async def delete(self, agent_id: str) -> bool: ...


class OpenClawAgentSourcePort(ABC):
    @abstractmethod
    async def list_agents(self) -> list[dict[str, Any]]: ...
