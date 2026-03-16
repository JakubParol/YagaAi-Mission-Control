import json
from typing import Any
from uuid import uuid4

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.planning.application.ports import ActivityLogRepository
from app.planning.infrastructure.tables import activity_log


class DbActivityLogRepository(ActivityLogRepository):
    def __init__(self, db: AsyncSession) -> None:
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
        await self._insert_event(
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

    async def _insert_event(
        self,
        *,
        event_id: str,
        event_name: str,
        actor_id: str | None,
        actor_type: str | None,
        entity_type: str,
        entity_id: str,
        scope: dict[str, Any] | None,
        metadata: dict[str, Any] | None,
        occurred_at: str,
    ) -> None:
        event_data_json = json.dumps(
            {"metadata": metadata, "occurred_at": occurred_at, "scope": scope},
            separators=(",", ":"),
            sort_keys=True,
        )
        await self._db.execute(
            insert(activity_log).values(
                id=event_id,
                event_name=event_name,
                actor_id=actor_id,
                actor_type=actor_type or "system",
                entity_type=entity_type,
                entity_id=entity_id,
                message=event_name,
                event_data_json=event_data_json,
                created_at=occurred_at,
            )
        )
