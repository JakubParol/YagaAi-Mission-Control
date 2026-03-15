from typing import Any
from uuid import uuid4

from app.planning.application.ports import TaskRepository
from app.planning.domain.models import Task, TaskAssignment
from app.planning.infrastructure.shared.events import _insert_assignment_event
from app.planning.infrastructure.shared.keys import _allocate_next_key, _project_exists
from app.planning.infrastructure.shared.mappers import _row_to_assignment, _row_to_task
from app.planning.infrastructure.shared.sql import (
    DbConnection,
    _build_list_queries,
    _build_update_query,
    _exists,
    _fetch_all,
    _fetch_count,
    _fetch_one,
    _parse_sort,
)
from app.shared.api.errors import ValidationError
from app.shared.utils import utc_now

_SORT_ALLOWED_TASK = {"created_at", "updated_at", "title", "priority", "status"}


class DbTaskRepository(TaskRepository):
    def __init__(self, db: DbConnection) -> None:
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
        where_parts: list[str] = []
        params: list[Any] = []

        if key:
            where_parts.append("key = ?")
            params.append(key)
        if project_id:
            where_parts.append("project_id = ?")
            params.append(project_id)
        if story_id:
            where_parts.append("story_id = ?")
            params.append(story_id)
        if epic_id:
            where_parts.append("story_id IN (SELECT id FROM stories WHERE epic_id = ?)")
            params.append(epic_id)
        if status:
            where_parts.append("status = ?")
            params.append(status)
        if assignee_id:
            where_parts.append("current_assignee_agent_id = ?")
            params.append(assignee_id)

        order_sql = _parse_sort(sort, _SORT_ALLOWED_TASK)
        count_q, select_q = _build_list_queries("tasks", where_parts, order_sql)

        total = await _fetch_count(self._db, count_q, params)
        rows = await _fetch_all(self._db, select_q, [*params, limit, offset])
        return [_row_to_task(r) for r in rows], total

    async def get_by_id(self, task_id: str) -> Task | None:
        row = await _fetch_one(self._db, "SELECT * FROM tasks WHERE id = ?", [task_id])
        return _row_to_task(row) if row else None

    async def get_by_key(self, key: str) -> Task | None:
        row = await _fetch_one(self._db, "SELECT * FROM tasks WHERE key = ?", [key.upper()])
        return _row_to_task(row) if row else None

    async def create(self, task: Task) -> Task:
        await self._db.execute(
            """INSERT INTO tasks (id, project_id, story_id, key, title, objective,
               task_type, status, is_blocked, blocked_reason, priority,
               estimate_points, due_at, current_assignee_agent_id,
               metadata_json, created_by, updated_by, created_at, updated_at,
               started_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                task.id,
                task.project_id,
                task.story_id,
                task.key,
                task.title,
                task.objective,
                task.task_type,
                task.status,
                1 if task.is_blocked else 0,
                task.blocked_reason,
                task.priority,
                task.estimate_points,
                task.due_at,
                task.current_assignee_agent_id,
                task.metadata_json,
                task.created_by,
                task.updated_by,
                task.created_at,
                task.updated_at,
                task.started_at,
                task.completed_at,
            ],
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
        sets = []
        params: list[Any] = []
        for k, v in data.items():
            if k in allowed:
                sets.append(k + " = ?")
                if k == "is_blocked":
                    params.append(1 if v else 0)
                else:
                    params.append(v)

        if not sets:
            return await self.get_by_id(task_id)

        params.append(task_id)
        await self._db.execute(_build_update_query("tasks", sets), params)
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
        sets = []
        params: list[Any] = []
        for k, v in data.items():
            if k in allowed:
                sets.append(k + " = ?")
                if k == "is_blocked":
                    params.append(1 if v else 0)
                else:
                    params.append(v)

        if not sets:
            return await self.get_by_id(task_id)

        row = await _fetch_one(self._db, "SELECT key FROM tasks WHERE id = ?", [task_id])
        if row is None:
            return None

        try:
            await self._db.execute("BEGIN")
            params.append(task_id)
            await self._db.execute(_build_update_query("tasks", sets), params)
            await _insert_assignment_event(
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
        cursor = await self._db.execute("DELETE FROM tasks WHERE id = ?", [task_id])
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def allocate_key(self, project_id: str) -> str:
        return await _allocate_next_key(self._db, project_id)

    async def project_exists(self, project_id: str) -> bool:
        return await _project_exists(self._db, project_id)

    async def story_exists(self, story_id: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM stories WHERE id = ?", [story_id])

    async def get_story_project_id(self, story_id: str) -> tuple[bool, str | None]:
        row = await _fetch_one(self._db, "SELECT project_id FROM stories WHERE id = ?", [story_id])
        if not row:
            return False, None
        return True, row["project_id"]

    async def get_story_task_progress(self, story_id: str) -> tuple[int, int]:
        row = await _fetch_one(
            self._db,
            """
            SELECT
              COUNT(*) AS task_count,
              SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) AS done_task_count
            FROM tasks
            WHERE story_id = ?
            """,
            [story_id],
        )
        if not row:
            return 0, 0
        return row["task_count"] or 0, row["done_task_count"] or 0

    async def agent_exists(self, agent_id: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM agents WHERE id = ?", [agent_id])

    async def label_exists(self, label_id: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM labels WHERE id = ?", [label_id])

    async def label_attached(self, task_id: str, label_id: str) -> bool:
        return await _exists(
            self._db,
            "SELECT 1 FROM task_labels WHERE task_id = ? AND label_id = ?",
            [task_id, label_id],
        )

    async def attach_label(self, task_id: str, label_id: str) -> None:
        await self._db.execute(
            """INSERT INTO task_labels (task_id, label_id, added_at)
               VALUES (?, ?, ?)""",
            [task_id, label_id, utc_now()],
        )
        await self._db.commit()

    async def detach_label(self, task_id: str, label_id: str) -> bool:
        cursor = await self._db.execute(
            "DELETE FROM task_labels WHERE task_id = ? AND label_id = ?",
            [task_id, label_id],
        )
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def get_active_assignment(self, task_id: str) -> TaskAssignment | None:
        row = await _fetch_one(
            self._db,
            "SELECT * FROM task_assignments WHERE task_id = ? AND unassigned_at IS NULL",
            [task_id],
        )
        return _row_to_assignment(row) if row else None

    async def get_assignments(self, task_id: str) -> list[TaskAssignment]:
        rows = await _fetch_all(
            self._db,
            "SELECT * FROM task_assignments WHERE task_id = ? ORDER BY assigned_at DESC",
            [task_id],
        )
        return [_row_to_assignment(r) for r in rows]

    async def create_assignment(self, assignment: TaskAssignment) -> TaskAssignment:
        await self._db.execute(
            """INSERT INTO task_assignments (id, task_id, agent_id, assigned_at,
               unassigned_at, assigned_by, reason)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [
                assignment.id,
                assignment.task_id,
                assignment.agent_id,
                assignment.assigned_at,
                assignment.unassigned_at,
                assignment.assigned_by,
                assignment.reason,
            ],
        )
        await self._db.commit()
        return assignment

    async def close_assignment(self, task_id: str, unassigned_at: str) -> bool:
        cursor = await self._db.execute(
            """UPDATE task_assignments
               SET unassigned_at = ?
               WHERE task_id = ? AND unassigned_at IS NULL""",
            [unassigned_at, task_id],
        )
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

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
        row = await _fetch_one(self._db, "SELECT key FROM tasks WHERE id = ?", [task_id])
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
            await self._db.execute("BEGIN")
            if previous_assignee_agent_id is not None:
                await self._db.execute(
                    """UPDATE task_assignments
                       SET unassigned_at = ?
                       WHERE task_id = ? AND unassigned_at IS NULL""",
                    [occurred_at, task_id],
                )
            await self._db.execute(
                """INSERT INTO task_assignments (id, task_id, agent_id, assigned_at,
                   unassigned_at, assigned_by, reason)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                [
                    assignment.id,
                    assignment.task_id,
                    assignment.agent_id,
                    assignment.assigned_at,
                    assignment.unassigned_at,
                    assignment.assigned_by,
                    assignment.reason,
                ],
            )
            await self._db.execute(
                "UPDATE tasks SET current_assignee_agent_id = ?, updated_at = ? WHERE id = ?",
                [agent_id, occurred_at, task_id],
            )
            await _insert_assignment_event(
                self._db,
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
            await self._db.commit()
        except Exception:
            await self._db.rollback()
            raise
        return assignment

    async def unassign_agent_with_event(
        self,
        *,
        task_id: str,
        previous_assignee_agent_id: str,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> bool:
        row = await _fetch_one(self._db, "SELECT key FROM tasks WHERE id = ?", [task_id])
        if row is None:
            return False
        try:
            await self._db.execute("BEGIN")
            cursor = await self._db.execute(
                """UPDATE task_assignments
                   SET unassigned_at = ?
                   WHERE task_id = ? AND unassigned_at IS NULL""",
                [occurred_at, task_id],
            )
            await self._db.execute(
                "UPDATE tasks SET current_assignee_agent_id = NULL, updated_at = ? WHERE id = ?",
                [occurred_at, task_id],
            )
            await _insert_assignment_event(
                self._db,
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
            await self._db.commit()
        except Exception:
            await self._db.rollback()
            raise
        return (cursor.rowcount or 0) > 0
