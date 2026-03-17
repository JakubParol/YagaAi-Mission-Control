from typing import cast as type_cast
from uuid import uuid4

from sqlalchemy import insert, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.planning.domain.models import TaskAssignment
from app.planning.infrastructure.shared.events import insert_assignment_event
from app.planning.infrastructure.shared.mappers import _row_to_assignment
from app.planning.infrastructure.tables import task_assignments, tasks
from app.shared.api.errors import ValidationError


async def get_active_assignment(db: AsyncSession, task_id: str) -> TaskAssignment | None:
    row = (
        (
            await db.execute(
                select(task_assignments).where(
                    (task_assignments.c.task_id == task_id)
                    & task_assignments.c.unassigned_at.is_(None)
                )
            )
        )
        .mappings()
        .first()
    )
    return _row_to_assignment(row) if row else None


async def get_assignments(db: AsyncSession, task_id: str) -> list[TaskAssignment]:
    rows = (
        (
            await db.execute(
                select(task_assignments)
                .where(task_assignments.c.task_id == task_id)
                .order_by(task_assignments.c.assigned_at.desc())
            )
        )
        .mappings()
        .all()
    )
    return [_row_to_assignment(r) for r in rows]


async def create_assignment(db: AsyncSession, assignment: TaskAssignment) -> TaskAssignment:
    await db.execute(
        insert(task_assignments).values(
            id=assignment.id,
            task_id=assignment.task_id,
            agent_id=assignment.agent_id,
            assigned_at=assignment.assigned_at,
            unassigned_at=assignment.unassigned_at,
            assigned_by=assignment.assigned_by,
            reason=assignment.reason,
        )
    )
    await db.commit()
    return assignment


async def close_assignment(db: AsyncSession, task_id: str, unassigned_at: str) -> bool:
    result = type_cast(
        CursorResult,
        await db.execute(
            update(task_assignments)
            .where(
                (task_assignments.c.task_id == task_id) & task_assignments.c.unassigned_at.is_(None)
            )
            .values(unassigned_at=unassigned_at)
        ),
    )
    await db.commit()
    return (result.rowcount or 0) > 0


async def assign_agent_with_event(
    db: AsyncSession,
    *,
    task_id: str,
    agent_id: str,
    previous_assignee_agent_id: str | None,
    assigned_by: str | None,
    occurred_at: str,
    correlation_id: str,
    causation_id: str,
) -> TaskAssignment:
    row = (await db.execute(select(tasks.c.key).where(tasks.c.id == task_id))).mappings().first()
    if row is None:
        raise ValidationError(f"Task {task_id} not found")

    assignment = TaskAssignment(
        id=str(uuid4()),
        task_id=task_id,
        agent_id=agent_id,
        assigned_at=occurred_at,
        unassigned_at=None,
        assigned_by=assigned_by,
        reason=None,
    )
    try:
        if previous_assignee_agent_id is not None:
            await db.execute(
                update(task_assignments)
                .where(
                    (task_assignments.c.task_id == task_id)
                    & task_assignments.c.unassigned_at.is_(None)
                )
                .values(unassigned_at=occurred_at)
            )
        await db.execute(
            insert(task_assignments).values(
                id=assignment.id,
                task_id=assignment.task_id,
                agent_id=assignment.agent_id,
                assigned_at=assignment.assigned_at,
                unassigned_at=assignment.unassigned_at,
                assigned_by=assignment.assigned_by,
                reason=assignment.reason,
            )
        )
        await db.execute(
            update(tasks)
            .where(tasks.c.id == task_id)
            .values(
                current_assignee_agent_id=agent_id,
                updated_at=occurred_at,
            )
        )
        await insert_assignment_event(
            db,
            actor_id=assigned_by,
            entity_type="task",
            entity_id=task_id,
            work_item_key=row["key"],
            new_assignee_agent_id=agent_id,
            previous_assignee_agent_id=previous_assignee_agent_id,
            occurred_at=occurred_at,
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return assignment


async def unassign_agent_with_event(
    db: AsyncSession,
    *,
    task_id: str,
    previous_assignee_agent_id: str,
    occurred_at: str,
    correlation_id: str,
    causation_id: str,
) -> bool:
    row = (await db.execute(select(tasks.c.key).where(tasks.c.id == task_id))).mappings().first()
    if row is None:
        return False
    try:
        result = type_cast(
            CursorResult,
            await db.execute(
                update(task_assignments)
                .where(
                    (task_assignments.c.task_id == task_id)
                    & task_assignments.c.unassigned_at.is_(None)
                )
                .values(unassigned_at=occurred_at)
            ),
        )
        await db.execute(
            update(tasks)
            .where(tasks.c.id == task_id)
            .values(
                current_assignee_agent_id=None,
                updated_at=occurred_at,
            )
        )
        await insert_assignment_event(
            db,
            actor_id=None,
            entity_type="task",
            entity_id=task_id,
            work_item_key=row["key"],
            new_assignee_agent_id=None,
            previous_assignee_agent_id=previous_assignee_agent_id,
            occurred_at=occurred_at,
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return (result.rowcount or 0) > 0
