from typing import Any
from typing import cast as type_cast

from sqlalchemy import case, delete, insert, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.functions import count
from sqlalchemy.sql.functions import sum as sa_sum

from app.planning.application.ports import TaskRepository
from app.planning.domain.models import Task, TaskAssignment
from app.planning.infrastructure.repositories.tasks._assignments import (
    assign_agent_with_event as _assign_agent_with_event,
)
from app.planning.infrastructure.repositories.tasks._assignments import (
    close_assignment as _close_assignment,
)
from app.planning.infrastructure.repositories.tasks._assignments import (
    create_assignment as _create_assignment,
)
from app.planning.infrastructure.repositories.tasks._assignments import (
    get_active_assignment as _get_active_assignment,
)
from app.planning.infrastructure.repositories.tasks._assignments import (
    get_assignments as _get_assignments,
)
from app.planning.infrastructure.repositories.tasks._assignments import (
    unassign_agent_with_event as _unassign_agent_with_event,
)
from app.planning.infrastructure.shared.events import insert_assignment_event
from app.planning.infrastructure.shared.mappers import _row_to_task
from app.planning.infrastructure.shared.sorting import parse_sort
from app.planning.infrastructure.tables import (
    agents,
    labels,
    project_counters,
    projects,
    stories,
    task_labels,
    tasks,
)
from app.shared.api.errors import ValidationError
from app.shared.utils import utc_now

_SORT_ALLOWED_TASK = {
    "created_at": tasks.c.created_at,
    "updated_at": tasks.c.updated_at,
    "title": tasks.c.title,
    "priority": tasks.c.priority,
    "status": tasks.c.status,
}


class DbTaskRepository(TaskRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_all(
        self,
        *,
        key: str | None = None,
        project_id: str | None = None,
        story_id: str | None = None,
        epic_id: str | None = None,
        status: str | None = None,
        assignee_id: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Task], int]:
        conditions = []
        if key:
            conditions.append(tasks.c.key == key)
        if project_id:
            conditions.append(tasks.c.project_id == project_id)
        if story_id:
            conditions.append(tasks.c.story_id == story_id)
        if epic_id:
            conditions.append(
                tasks.c.story_id.in_(select(stories.c.id).where(stories.c.epic_id == epic_id))
            )
        if status:
            conditions.append(tasks.c.status == status)
        if assignee_id:
            conditions.append(tasks.c.current_assignee_agent_id == assignee_id)

        order = parse_sort(sort, _SORT_ALLOWED_TASK)
        if not order:
            order = [tasks.c.created_at.desc()]

        count_q = select(count()).select_from(tasks)
        select_q = select(tasks)
        for cond in conditions:
            count_q = count_q.where(cond)
            select_q = select_q.where(cond)
        select_q = select_q.order_by(*order).limit(limit).offset(offset)

        total = (await self._db.execute(count_q)).scalar_one()
        rows = (await self._db.execute(select_q)).mappings().all()
        return [_row_to_task(r) for r in rows], total

    async def get_by_id(self, task_id: str) -> Task | None:
        row = (
            (await self._db.execute(select(tasks).where(tasks.c.id == task_id))).mappings().first()
        )
        return _row_to_task(row) if row else None

    async def get_by_key(self, key: str) -> Task | None:
        row = (
            (await self._db.execute(select(tasks).where(tasks.c.key == key.upper())))
            .mappings()
            .first()
        )
        return _row_to_task(row) if row else None

    async def create(self, task: Task) -> Task:
        await self._db.execute(
            insert(tasks).values(
                id=task.id,
                project_id=task.project_id,
                story_id=task.story_id,
                key=task.key,
                title=task.title,
                objective=task.objective,
                task_type=task.task_type,
                status=task.status,
                is_blocked=1 if task.is_blocked else 0,
                blocked_reason=task.blocked_reason,
                priority=task.priority,
                estimate_points=task.estimate_points,
                due_at=task.due_at,
                current_assignee_agent_id=task.current_assignee_agent_id,
                metadata_json=task.metadata_json,
                created_by=task.created_by,
                updated_by=task.updated_by,
                created_at=task.created_at,
                updated_at=task.updated_at,
                started_at=task.started_at,
                completed_at=task.completed_at,
            )
        )
        await self._db.commit()
        return task

    async def update(self, task_id: str, data: dict[str, Any]) -> Task | None:
        allowed = {
            "title",
            "objective",
            "task_type",
            "status",
            "story_id",
            "is_blocked",
            "blocked_reason",
            "priority",
            "estimate_points",
            "due_at",
            "current_assignee_agent_id",
            "metadata_json",
            "updated_by",
            "updated_at",
            "started_at",
            "completed_at",
        }
        values = {k: v for k, v in data.items() if k in allowed}
        if not values:
            return await self.get_by_id(task_id)

        if "is_blocked" in values:
            values["is_blocked"] = 1 if values["is_blocked"] else 0

        await self._db.execute(update(tasks).where(tasks.c.id == task_id).values(**values))
        await self._db.commit()
        return await self.get_by_id(task_id)

    async def update_assignee_with_event(
        self,
        *,
        task_id: str,
        data: dict[str, Any],
        new_assignee_agent_id: str | None,
        previous_assignee_agent_id: str | None,
        actor_id: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> Task | None:
        allowed = {
            "title",
            "objective",
            "task_type",
            "status",
            "story_id",
            "is_blocked",
            "blocked_reason",
            "priority",
            "estimate_points",
            "due_at",
            "current_assignee_agent_id",
            "metadata_json",
            "updated_by",
            "updated_at",
            "started_at",
            "completed_at",
        }
        values = {k: v for k, v in data.items() if k in allowed}
        if not values:
            return await self.get_by_id(task_id)

        if "is_blocked" in values:
            values["is_blocked"] = 1 if values["is_blocked"] else 0

        row = (
            (await self._db.execute(select(tasks.c.key).where(tasks.c.id == task_id)))
            .mappings()
            .first()
        )
        if row is None:
            return None

        try:
            await self._db.execute(update(tasks).where(tasks.c.id == task_id).values(**values))
            await insert_assignment_event(
                self._db,
                actor_id=actor_id,
                entity_type="task",
                entity_id=task_id,
                work_item_key=row["key"],
                new_assignee_agent_id=new_assignee_agent_id,
                previous_assignee_agent_id=previous_assignee_agent_id,
                occurred_at=occurred_at,
                correlation_id=correlation_id,
                causation_id=causation_id,
            )
            await self._db.commit()
        except Exception:
            await self._db.rollback()
            raise
        return await self.get_by_id(task_id)

    async def delete(self, task_id: str) -> bool:
        result = type_cast(
            CursorResult, await self._db.execute(delete(tasks).where(tasks.c.id == task_id))
        )
        await self._db.commit()
        return (result.rowcount or 0) > 0

    async def allocate_key(self, project_id: str) -> str:
        row = (
            (await self._db.execute(select(projects.c.key).where(projects.c.id == project_id)))
            .mappings()
            .first()
        )
        if not row:
            raise ValidationError(f"Project {project_id} does not exist")
        project_key = row["key"]

        counter_row = (
            (
                await self._db.execute(
                    select(project_counters.c.next_number).where(
                        project_counters.c.project_id == project_id
                    )
                )
            )
            .mappings()
            .first()
        )
        if not counter_row:
            raise ValidationError(f"No counter found for project {project_id}")

        next_num = counter_row["next_number"]
        await self._db.execute(
            update(project_counters)
            .where(project_counters.c.project_id == project_id)
            .values(
                next_number=project_counters.c.next_number + 1,
                updated_at=utc_now(),
            )
        )
        await self._db.commit()
        return f"{project_key}-{next_num}"

    async def project_exists(self, project_id: str) -> bool:
        row = (
            await self._db.execute(select(projects.c.id).where(projects.c.id == project_id))
        ).first()
        return row is not None

    async def story_exists(self, story_id: str) -> bool:
        row = (await self._db.execute(select(stories.c.id).where(stories.c.id == story_id))).first()
        return row is not None

    async def get_story_project_id(self, story_id: str) -> tuple[bool, str | None]:
        row = (
            (await self._db.execute(select(stories.c.project_id).where(stories.c.id == story_id)))
            .mappings()
            .first()
        )
        if not row:
            return False, None
        return True, row["project_id"]

    async def get_story_task_progress(self, story_id: str) -> tuple[int, int]:
        result = await self._db.execute(
            select(
                count().label("task_count"),
                sa_sum(case((tasks.c.status == "DONE", 1), else_=0)).label("done_task_count"),
            ).where(tasks.c.story_id == story_id)
        )
        row = result.mappings().first()
        if not row:
            return 0, 0
        return row["task_count"] or 0, row["done_task_count"] or 0

    async def agent_exists(self, agent_id: str) -> bool:
        row = (await self._db.execute(select(agents.c.id).where(agents.c.id == agent_id))).first()
        return row is not None

    async def label_exists(self, label_id: str) -> bool:
        row = (await self._db.execute(select(labels.c.id).where(labels.c.id == label_id))).first()
        return row is not None

    async def label_attached(self, task_id: str, label_id: str) -> bool:
        row = (
            await self._db.execute(
                select(task_labels.c.task_id).where(
                    (task_labels.c.task_id == task_id) & (task_labels.c.label_id == label_id)
                )
            )
        ).first()
        return row is not None

    async def attach_label(self, task_id: str, label_id: str) -> None:
        await self._db.execute(
            insert(task_labels).values(task_id=task_id, label_id=label_id, added_at=utc_now())
        )
        await self._db.commit()

    async def detach_label(self, task_id: str, label_id: str) -> bool:
        result = type_cast(
            CursorResult,
            await self._db.execute(
                delete(task_labels).where(
                    (task_labels.c.task_id == task_id) & (task_labels.c.label_id == label_id)
                )
            ),
        )
        await self._db.commit()
        return (result.rowcount or 0) > 0

    async def get_active_assignment(self, task_id: str) -> TaskAssignment | None:
        return await _get_active_assignment(self._db, task_id)

    async def get_assignments(self, task_id: str) -> list[TaskAssignment]:
        return await _get_assignments(self._db, task_id)

    async def create_assignment(self, assignment: TaskAssignment) -> TaskAssignment:
        return await _create_assignment(self._db, assignment)

    async def close_assignment(self, task_id: str, unassigned_at: str) -> bool:
        return await _close_assignment(self._db, task_id, unassigned_at)

    async def assign_agent_with_event(
        self,
        *,
        task_id: str,
        agent_id: str,
        previous_assignee_agent_id: str | None,
        assigned_by: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> TaskAssignment:
        return await _assign_agent_with_event(
            self._db,
            task_id=task_id,
            agent_id=agent_id,
            previous_assignee_agent_id=previous_assignee_agent_id,
            assigned_by=assigned_by,
            occurred_at=occurred_at,
            correlation_id=correlation_id,
            causation_id=causation_id,
        )

    async def unassign_agent_with_event(
        self,
        *,
        task_id: str,
        previous_assignee_agent_id: str,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> bool:
        return await _unassign_agent_with_event(
            self._db,
            task_id=task_id,
            previous_assignee_agent_id=previous_assignee_agent_id,
            occurred_at=occurred_at,
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
