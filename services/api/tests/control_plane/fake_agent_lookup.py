"""In-memory fake for AgentLookupPort."""

from app.shared.ports import AgentInfo, AgentLookupPort


class FakeAgentLookup(AgentLookupPort):
    def __init__(self, agents: dict[str, AgentInfo] | None = None) -> None:
        self._agents = agents or {}

    async def get_agent_by_id(self, agent_id: str) -> AgentInfo | None:
        return self._agents.get(agent_id)
