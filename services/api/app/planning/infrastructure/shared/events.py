import json
from typing import Any
from uuid import uuid4

from app.planning.infrastructure.shared.sql import DbConnection


def _assignment_payload(agent_id: str | None) -> dict[str, str] | None:
    if agent_id is None:
        return None
    return {"id": agent_id}


async def _insert_activity_log_event(
    db: DbConnection,
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
    await db.execute(
        """
        INSERT INTO activity_log (
          id, event_name, actor_id, actor_type,
          entity_type, entity_id, message, event_data_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            event_id,
            event_name,
            actor_id,
            actor_type or "system",
            entity_type,
            entity_id,
            event_name,
            event_data_json,
            occurred_at,
        ],
    )


async def _insert_assignment_event(
    db: DbConnection,
    *,
    actor_id: str | None,
    entity_type: str,
    entity_id: str,
    work_item_key: str | None,
    new_assignee_agent_id: str | None,
    previous_assignee_agent_id: str | None,
    occurred_at: str,
    correlation_id: str,
    causation_id: str,
) -> None:
    await _insert_activity_log_event(
        db,
        event_id=str(uuid4()),
        event_name="planning.assignment.changed",
        actor_id=actor_id,
        actor_type="system",
        entity_type=entity_type,
        entity_id=entity_id,
        scope={
            "work_item_key": work_item_key,
            "correlation_id": correlation_id,
            "causation_id": causation_id,
        },
        metadata={
            "work_item_key": work_item_key,
            "assignee_agent": _assignment_payload(new_assignee_agent_id),
            "previous_assignee": _assignment_payload(previous_assignee_agent_id),
            "correlation_id": correlation_id,
            "causation_id": causation_id,
            "timestamp": occurred_at,
        },
        occurred_at=occurred_at,
    )
