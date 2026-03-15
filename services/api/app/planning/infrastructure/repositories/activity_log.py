from typing import Any
from uuid import uuid4

from app.planning.application.ports import ActivityLogRepository
from app.planning.infrastructure.shared.events import _insert_activity_log_event
from app.planning.infrastructure.shared.sql import DbConnection


class DbActivityLogRepository(ActivityLogRepository):
    def __init__(self, db: DbConnection) -> None:
        self._db = db

    async def log_event(
        self,
        *,
        event_name: str,
        actor_id: str | None,
        actor_type: str | None,
        entity_type: str,
        entity_id: str,
        scope: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        occurred_at: str,
    ) -> None:
        event_id = str(uuid4())
        await _insert_activity_log_event(
            self._db,
            event_id=event_id,
            event_name=event_name,
            actor_id=actor_id,
            actor_type=actor_type,
            entity_type=entity_type,
            entity_id=entity_id,
            scope=scope,
            metadata=metadata,
            occurred_at=occurred_at,
        )
        await self._db.commit()
