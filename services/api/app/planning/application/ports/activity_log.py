from abc import ABC, abstractmethod
from typing import Any


class ActivityLogRepository(ABC):
    @abstractmethod
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
    ) -> None: ...
