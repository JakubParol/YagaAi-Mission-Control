import json
from uuid import uuid4

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.planning.infrastructure.tables import activity_log


async def insert_assignment_event(
    db: AsyncSession,
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
    new_payload = {"id": new_assignee_agent_id} if new_assignee_agent_id else None
    prev_payload = {"id": previous_assignee_agent_id} if previous_assignee_agent_id else None
    scope = {
        "work_item_key": work_item_key,
        "correlation_id": correlation_id,
        "causation_id": causation_id,
    }
    metadata = {
        "work_item_key": work_item_key,
        "assignee_agent": new_payload,
        "previous_assignee": prev_payload,
        "correlation_id": correlation_id,
        "causation_id": causation_id,
        "timestamp": occurred_at,
    }
    event_data_json = json.dumps(
        {"metadata": metadata, "occurred_at": occurred_at, "scope": scope},
        separators=(",", ":"),
        sort_keys=True,
    )
    await db.execute(
        insert(activity_log).values(
            id=str(uuid4()),
            event_name="planning.assignment.changed",
            actor_id=actor_id,
            actor_type="system",
            entity_type=entity_type,
            entity_id=entity_id,
            message="planning.assignment.changed",
            event_data_json=event_data_json,
            created_at=occurred_at,
        )
    )
