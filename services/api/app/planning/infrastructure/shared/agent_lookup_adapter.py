from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.planning.infrastructure.tables import agents
from app.shared.ports import AgentInfo, AgentLookupPort


class DbAgentLookupAdapter(AgentLookupPort):
    """Thin adapter implementing AgentLookupPort via direct DB read.

    Avoids importing the full Planning Agent model into control-plane.
    Reads only the fields needed for dispatch resolution.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_agent_by_id(self, agent_id: str) -> AgentInfo | None:
        row = (
            await self._db.execute(
                select(
                    agents.c.id,
                    agents.c.openclaw_key,
                    agents.c.main_session_key,
                ).where(agents.c.id == agent_id)
            )
        ).first()
        if row is None:
            return None
        return AgentInfo(
            agent_id=str(row.id),
            openclaw_key=str(row.openclaw_key),
            main_session_key=str(row.main_session_key) if row.main_session_key else None,
        )
