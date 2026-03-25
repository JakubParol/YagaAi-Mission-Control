from sqlalchemy import column, select, table
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.ports import AgentInfo, AgentLookupPort

# Ad-hoc table reference — avoids importing app.planning.infrastructure.tables
# so this module stays free of cross-module infrastructure dependencies.
_agents = table("agents", column("id"), column("openclaw_key"), column("main_session_key"))


class DbAgentLookupAdapter(AgentLookupPort):
    """Thin adapter implementing AgentLookupPort via direct DB read.

    Lives in shared/ because both planning and control-plane modules
    need it in their composition roots.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_agent_by_id(self, agent_id: str) -> AgentInfo | None:
        row = (
            await self._db.execute(
                select(
                    _agents.c.id,
                    _agents.c.openclaw_key,
                    _agents.c.main_session_key,
                ).where(_agents.c.id == agent_id)
            )
        ).first()
        if row is None:
            return None
        return AgentInfo(
            agent_id=str(row.id),
            openclaw_key=str(row.openclaw_key),
            main_session_key=str(row.main_session_key) if row.main_session_key else None,
        )
