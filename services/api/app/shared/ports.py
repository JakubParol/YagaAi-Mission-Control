from dataclasses import dataclass
from typing import Protocol


@dataclass
class AgentInfo:
    """Minimal agent DTO for cross-module lookups (no Planning model leak)."""

    agent_id: str
    openclaw_key: str
    main_session_key: str | None


class AgentLookupPort(Protocol):
    async def get_agent_by_id(self, agent_id: str) -> AgentInfo | None: ...


class OnAssignmentChanged(Protocol):
    async def __call__(
        self,
        *,
        work_item_id: str,
        work_item_key: str | None,
        work_item_type: str,
        work_item_title: str,
        work_item_status: str,
        project_id: str | None,
        agent_id: str | None,
        previous_agent_id: str | None,
    ) -> None: ...
