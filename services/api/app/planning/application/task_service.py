from typing import Any

from app.planning.application.ports import TaskRepository
from app.planning.domain.models import ItemStatus, Task, TaskAssignment
from app.shared.api.errors import BusinessRuleError, ConflictError, NotFoundError, ValidationError
from app.shared.utils import new_uuid, utc_now


class TaskService:
    def __init__(
        self,
        task_repo: TaskRepository,
    ) -> None:
        self._task_repo = task_repo

    async def list_tasks(
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
        return await self._task_repo.list_all(
            key=key,
            project_id=project_id,
            story_id=story_id,
            epic_id=epic_id,
            status=status,
            assignee_id=assignee_id,
            limit=limit,
            offset=offset,
            sort=sort,
        )

    async def get_task(self, task_id: str) -> tuple[Task, list[TaskAssignment]]:
        task = await self._task_repo.get_by_id(task_id)
        if not task:
            raise NotFoundError(f"Task {task_id} not found")
        assignments = await self._task_repo.get_assignments(task_id)
        return task, assignments

    async def get_task_by_key(self, key: str) -> tuple[Task, list[TaskAssignment]]:
        task = await self._task_repo.get_by_key(key)
        if not task:
            raise NotFoundError(f"Task with key '{key}' not found")
        assignments = await self._task_repo.get_assignments(task.id)
        return task, assignments

    async def create_task(
        self,
        *,
        title: str,
        task_type: str,
        project_id: str | None = None,
        story_id: str | None = None,
        objective: str | None = None,
        description: str | None = None,
        priority: int | None = None,
        estimate_points: float | None = None,
        due_at: str | None = None,
        actor: str | None = None,
    ) -> Task:
        if story_id:
            story_exists, story_project_id = await self._task_repo.get_story_project_id(story_id)
            if not story_exists:
                raise ValidationError(f"Story {story_id} does not exist")
            if project_id is None:
                project_id = story_project_id
            elif project_id != story_project_id:
                raise ConflictError(
                    f"Task project {project_id} conflicts with story {story_id} project {story_project_id}"
                )

        key: str | None = None
        if project_id:
            if not await self._task_repo.project_exists(project_id):
                raise ValidationError(f"Project {project_id} does not exist")
            key = await self._task_repo.allocate_key(project_id)

        now = utc_now()
        task = Task(
            id=new_uuid(),
            project_id=project_id,
            story_id=story_id,
            key=key,
            title=title,
            objective=objective,
            task_type=task_type,
            status=ItemStatus.TODO,
            is_blocked=False,
            blocked_reason=None,
            priority=priority,
            estimate_points=estimate_points,
            due_at=due_at,
            current_assignee_agent_id=None,
            metadata_json=description,
            created_by=actor,
            updated_by=actor,
            created_at=now,
            updated_at=now,
            started_at=None,
            completed_at=None,
        )
        return await self._task_repo.create(task)

    async def update_task(
        self, task_id: str, data: dict[str, Any], *, actor: str | None = None
    ) -> Task:
        existing = await self._task_repo.get_by_id(task_id)
        if not existing:
            raise NotFoundError(f"Task {task_id} not found")

        now = utc_now()
        next_is_blocked = data.get("is_blocked", existing.is_blocked)
        blocked_reason_in_payload = "blocked_reason" in data
        blocked_reason = data.get("blocked_reason", existing.blocked_reason)

        if "status" in data:
            new_status = data["status"]
            valid = {s.value for s in ItemStatus}
            if new_status not in valid:
                raise ValidationError(
                    f"Invalid task status '{new_status}'. Allowed: {', '.join(sorted(valid))}"
                )

            if new_status == ItemStatus.DONE and next_is_blocked:
                raise BusinessRuleError("Blocked task cannot be moved to DONE")

            if new_status == ItemStatus.DONE:
                data["completed_at"] = now
                await self._task_repo.close_assignment(task_id, now)
            elif existing.status == ItemStatus.DONE:
                data["completed_at"] = None

            if new_status == ItemStatus.IN_PROGRESS and existing.started_at is None:
                data["started_at"] = now

        if "story_id" in data and data["story_id"] is not None:
            story_exists, story_project_id = await self._task_repo.get_story_project_id(
                data["story_id"]
            )
            if not story_exists:
                raise ValidationError(f"Story {data['story_id']} does not exist")
            if existing.project_id != story_project_id:
                raise ConflictError(
                    f"Task project {existing.project_id} conflicts with story {data['story_id']} project {story_project_id}"
                )

        if blocked_reason_in_payload and blocked_reason is not None and not next_is_blocked:
            raise BusinessRuleError("blocked_reason can be set only when is_blocked is true")
        if not next_is_blocked:
            data["blocked_reason"] = None

        data["updated_by"] = actor
        data["updated_at"] = now

        updated = await self._task_repo.update(task_id, data)
        if not updated:
            raise NotFoundError(f"Task {task_id} not found")

        return updated

    async def get_story_progress(self, story_id: str | None) -> dict[str, int]:
        if not story_id:
            return {}
        task_count, done_task_count = await self._task_repo.get_story_task_progress(story_id)
        return {
            "story_task_count": task_count,
            "story_done_task_count": done_task_count,
        }

    async def delete_task(self, task_id: str) -> None:
        deleted = await self._task_repo.delete(task_id)
        if not deleted:
            raise NotFoundError(f"Task {task_id} not found")

    async def attach_label(self, task_id: str, label_id: str) -> None:
        if not await self._task_repo.get_by_id(task_id):
            raise NotFoundError(f"Task {task_id} not found")
        if not await self._task_repo.label_exists(label_id):
            raise ValidationError(f"Label {label_id} does not exist")
        if await self._task_repo.label_attached(task_id, label_id):
            raise ConflictError(f"Label {label_id} already attached to task {task_id}")
        await self._task_repo.attach_label(task_id, label_id)

    async def detach_label(self, task_id: str, label_id: str) -> None:
        if not await self._task_repo.get_by_id(task_id):
            raise NotFoundError(f"Task {task_id} not found")
        removed = await self._task_repo.detach_label(task_id, label_id)
        if not removed:
            raise NotFoundError(f"Label {label_id} not attached to task {task_id}")

    async def assign_agent(
        self, task_id: str, agent_id: str, *, assigned_by: str | None = None
    ) -> TaskAssignment:
        task = await self._task_repo.get_by_id(task_id)
        if not task:
            raise NotFoundError(f"Task {task_id} not found")
        if not await self._task_repo.agent_exists(agent_id):
            raise ValidationError(f"Agent {agent_id} does not exist")

        active = await self._task_repo.get_active_assignment(task_id)
        if active:
            if active.agent_id == agent_id:
                raise ConflictError(f"Agent {agent_id} is already assigned to task {task_id}")
            now = utc_now()
            await self._task_repo.close_assignment(task_id, now)

        now = utc_now()
        assignment = TaskAssignment(
            id=new_uuid(),
            task_id=task_id,
            agent_id=agent_id,
            assigned_at=now,
            unassigned_at=None,
            assigned_by=assigned_by,
            reason=None,
        )
        created = await self._task_repo.create_assignment(assignment)

        await self._task_repo.update(
            task_id, {"current_assignee_agent_id": agent_id, "updated_at": utc_now()}
        )
        return created

    async def unassign_agent(self, task_id: str, agent_id: str) -> None:
        task = await self._task_repo.get_by_id(task_id)
        if not task:
            raise NotFoundError(f"Task {task_id} not found")

        active = await self._task_repo.get_active_assignment(task_id)
        if not active or active.agent_id != agent_id:
            raise NotFoundError(f"Agent {agent_id} is not actively assigned to task {task_id}")

        now = utc_now()
        await self._task_repo.close_assignment(task_id, now)
        await self._task_repo.update(
            task_id, {"current_assignee_agent_id": None, "updated_at": utc_now()}
        )
