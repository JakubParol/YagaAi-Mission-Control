"""Work item assignment helper queries."""

from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.planning.domain.models import WorkItemAssignment
from app.planning.infrastructure.shared.events import insert_assignment_event
from app.planning.infrastructure.shared.mappers import _row_to_work_item_assignment
from app.planning.infrastructure.shared.sql import affected_rows
from app.planning.infrastructure.tables import work_item_assignments, work_items
from app.shared.utils import new_uuid


async def get_active_assignment(db: AsyncSession, work_item_id: str) -> WorkItemAssignment | None:
    row = (
        (
            await db.execute(
                select(work_item_assignments).where(
                    work_item_assignments.c.work_item_id == work_item_id,
                    work_item_assignments.c.unassigned_at.is_(None),
                )
            )
        )
        .mappings()
        .first()
    )
    return _row_to_work_item_assignment(row) if row else None


async def get_assignments(db: AsyncSession, work_item_id: str) -> list[WorkItemAssignment]:
    rows = (
        (
            await db.execute(
                select(work_item_assignments)
                .where(work_item_assignments.c.work_item_id == work_item_id)
                .order_by(work_item_assignments.c.assigned_at.desc())
            )
        )
        .mappings()
        .all()
    )
    return [_row_to_work_item_assignment(r) for r in rows]


async def create_assignment(db: AsyncSession, assignment: WorkItemAssignment) -> WorkItemAssignment:
    await db.execute(
        insert(work_item_assignments).values(
            id=assignment.id,
            work_item_id=assignment.work_item_id,
            agent_id=assignment.agent_id,
            assigned_at=assignment.assigned_at,
            unassigned_at=assignment.unassigned_at,
            assigned_by=assignment.assigned_by,
            reason=assignment.reason,
        )
    )
    await db.commit()
    return assignment


async def close_assignment(db: AsyncSession, work_item_id: str, unassigned_at: str) -> bool:
    result = await db.execute(
        update(work_item_assignments)
        .where(
            work_item_assignments.c.work_item_id == work_item_id,
            work_item_assignments.c.unassigned_at.is_(None),
        )
        .values(unassigned_at=unassigned_at)
    )
    await db.commit()
    return affected_rows(result) > 0


async def assign_agent_with_event(
    db: AsyncSession,
    *,
    work_item_id: str,
    agent_id: str,
    previous_assignee_agent_id: str | None,
    assigned_by: str | None,
    occurred_at: str,
    correlation_id: str,
    causation_id: str,
) -> WorkItemAssignment:
    # Close any current active assignment.
    if previous_assignee_agent_id:
        await close_assignment(db, work_item_id, occurred_at)

    # Update the denormalized field on the work item.
    await db.execute(
        update(work_items)
        .where(work_items.c.id == work_item_id)
        .values(
            current_assignee_agent_id=agent_id,
            updated_at=occurred_at,
        )
    )

    assignment = WorkItemAssignment(
        id=new_uuid(),
        work_item_id=work_item_id,
        agent_id=agent_id,
        assigned_at=occurred_at,
        unassigned_at=None,
        assigned_by=assigned_by,
        reason=None,
    )
    await db.execute(
        insert(work_item_assignments).values(
            id=assignment.id,
            work_item_id=assignment.work_item_id,
            agent_id=assignment.agent_id,
            assigned_at=assignment.assigned_at,
            unassigned_at=None,
            assigned_by=assignment.assigned_by,
            reason=None,
        )
    )

    # Get item key for event.
    item_row = (
        (await db.execute(select(work_items.c.key).where(work_items.c.id == work_item_id)))
        .mappings()
        .first()
    )
    item_key = item_row["key"] if item_row else None

    await insert_assignment_event(
        db,
        actor_id=assigned_by,
        entity_type="work_item",
        entity_id=work_item_id,
        work_item_key=item_key,
        new_assignee_agent_id=agent_id,
        previous_assignee_agent_id=previous_assignee_agent_id,
        occurred_at=occurred_at,
        correlation_id=correlation_id,
        causation_id=causation_id,
    )
    await db.commit()
    return assignment


async def unassign_agent_with_event(
    db: AsyncSession,
    *,
    work_item_id: str,
    previous_assignee_agent_id: str,
    occurred_at: str,
    correlation_id: str,
    causation_id: str,
) -> bool:
    closed = await close_assignment(db, work_item_id, occurred_at)
    if not closed:
        return False

    await db.execute(
        update(work_items)
        .where(work_items.c.id == work_item_id)
        .values(current_assignee_agent_id=None, updated_at=occurred_at)
    )

    item_row = (
        (await db.execute(select(work_items.c.key).where(work_items.c.id == work_item_id)))
        .mappings()
        .first()
    )
    item_key = item_row["key"] if item_row else None

    await insert_assignment_event(
        db,
        actor_id=None,
        entity_type="work_item",
        entity_id=work_item_id,
        work_item_key=item_key,
        new_assignee_agent_id=None,
        previous_assignee_agent_id=previous_assignee_agent_id,
        occurred_at=occurred_at,
        correlation_id=correlation_id,
        causation_id=causation_id,
    )
    await db.commit()
    return True
