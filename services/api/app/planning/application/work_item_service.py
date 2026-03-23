from typing import Any

from app.planning.application.ports.work_item import WorkItemRepository
from app.planning.domain.models import (
    StatusMode,
    WorkItem,
    WorkItemAssignment,
    WorkItemOverview,
    WorkItemStatus,
    WorkItemType,
)
from app.shared.api.errors import (
    BusinessRuleError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.shared.ports import OnAssignmentChanged
from app.shared.utils import new_uuid, utc_now


class WorkItemService:
    def __init__(
        self,
        work_item_repo: WorkItemRepository,
        on_assignment_changed: OnAssignmentChanged | None = None,
    ) -> None:
        self._repo = work_item_repo
        self._on_assignment_changed = on_assignment_changed

    # ------------------------------------------------------------------
    # List / Get
    # ------------------------------------------------------------------

    async def list_work_items(
        self,
        *,
        type: str | None = None,
        project_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        assignee_id: str | None = None,
        key: str | None = None,
        sub_type: str | None = None,
        is_blocked: bool | None = None,
        text_search: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[dict[str, Any]], int]:
        return await self._repo.list_enriched(
            type=type,
            project_id=project_id,
            parent_id=parent_id,
            status=status,
            assignee_id=assignee_id,
            key=key,
            sub_type=sub_type,
            is_blocked=is_blocked,
            text_search=text_search,
            limit=limit,
            offset=offset,
            sort=sort,
        )

    async def get_work_item(self, work_item_id: str) -> tuple[WorkItem, int]:
        item = await self._repo.get_by_id(work_item_id)
        if not item:
            raise NotFoundError(f"Work item {work_item_id} not found")
        children_count = await self._repo.get_children_count(work_item_id)
        return item, children_count

    async def get_work_item_by_key(self, key: str) -> tuple[WorkItem, int]:
        item = await self._repo.get_by_key(key)
        if not item:
            raise NotFoundError(f"Work item with key '{key}' not found")
        children_count = await self._repo.get_children_count(item.id)
        return item, children_count

    async def get_work_item_by_key_or_none(self, key: str) -> WorkItem | None:
        return await self._repo.get_by_key(key)

    async def list_children(
        self,
        work_item_id: str,
        *,
        type: str | None = None,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[WorkItem], int]:
        if not await self._repo.get_by_id(work_item_id):
            raise NotFoundError(f"Work item {work_item_id} not found")
        return await self._repo.list_children(
            work_item_id,
            type=type,
            status=status,
            limit=limit,
            offset=offset,
            sort=sort,
        )

    # ------------------------------------------------------------------
    # Overview
    # ------------------------------------------------------------------

    async def list_overview(
        self,
        *,
        type: str | None = None,
        project_id: str | None = None,
        status: str | None = None,
        assignee_id: str | None = None,
        is_blocked: bool | None = None,
        label: str | None = None,
        text_search: str | None = None,
        limit: int = 50,
        offset: int = 0,
        sort: str = "-updated_at",
    ) -> tuple[list[WorkItemOverview], int]:
        return await self._repo.list_overview(
            type=type,
            project_id=project_id,
            status=status,
            assignee_id=assignee_id,
            is_blocked=is_blocked,
            label=label,
            text_search=text_search,
            limit=limit,
            offset=offset,
            sort=sort,
        )

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    async def create_work_item(
        self,
        *,
        type: str,
        title: str,
        project_id: str | None = None,
        parent_id: str | None = None,
        sub_type: str | None = None,
        summary: str | None = None,
        description: str | None = None,
        priority: int | None = None,
        estimate_points: float | None = None,
        due_at: str | None = None,
        current_assignee_agent_id: str | None = None,
        backlog_id: str | None = None,
        actor: str | None = None,
    ) -> WorkItem:
        self._validate_type(type)

        if parent_id:
            parent = await self._repo.get_by_id(parent_id)
            if not parent:
                raise ValidationError(f"Parent {parent_id} does not exist")
            if project_id is None:
                project_id = parent.project_id
            elif parent.project_id and project_id != parent.project_id:
                raise ConflictError(
                    f"Project {project_id} conflicts with parent project " f"{parent.project_id}"
                )

        key: str | None = None
        if project_id:
            if not await self._repo.project_exists(project_id):
                raise ValidationError(f"Project {project_id} does not exist")
            key = await self._repo.allocate_key(project_id)

        if current_assignee_agent_id is not None:
            if not await self._repo.agent_exists(current_assignee_agent_id):
                raise ValidationError(f"Agent {current_assignee_agent_id} does not exist")

        if backlog_id is not None:
            if not await self._repo.backlog_exists(backlog_id):
                raise ValidationError(f"Backlog {backlog_id} does not exist")

        now = utc_now()
        item = WorkItem(
            id=new_uuid(),
            project_id=project_id,
            parent_id=parent_id,
            key=key,
            type=WorkItemType(type),
            sub_type=sub_type,
            title=title,
            summary=summary,
            description=description,
            status=WorkItemStatus.TODO,
            status_mode=StatusMode.MANUAL,
            status_override=None,
            status_override_set_at=None,
            is_blocked=False,
            blocked_reason=None,
            priority=priority,
            estimate_points=estimate_points,
            due_at=due_at,
            current_assignee_agent_id=current_assignee_agent_id,
            metadata_json=None,
            created_by=actor,
            updated_by=actor,
            created_at=now,
            updated_at=now,
            started_at=None,
            completed_at=None,
        )
        if backlog_id:
            return await self._repo.create_in_backlog(item, backlog_id)
        return await self._repo.create(item)

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    async def update_work_item(
        self,
        work_item_id: str,
        data: dict[str, Any],
        *,
        actor: str | None = None,
    ) -> WorkItem:
        existing = await self._repo.get_by_id(work_item_id)
        if not existing:
            raise NotFoundError(f"Work item {work_item_id} not found")

        now = utc_now()

        if "status" in data:
            await self._apply_status_transition(work_item_id, data, existing, now)

        if "parent_id" in data and data["parent_id"] is not None:
            parent = await self._repo.get_by_id(data["parent_id"])
            if not parent:
                raise ValidationError(f"Parent {data['parent_id']} does not exist")
            if existing.project_id and parent.project_id:
                if existing.project_id != parent.project_id:
                    raise ConflictError(
                        f"Project {existing.project_id} conflicts with parent "
                        f"project {parent.project_id}"
                    )

        if "current_assignee_agent_id" in data and data["current_assignee_agent_id"] is not None:
            if not await self._repo.agent_exists(data["current_assignee_agent_id"]):
                raise ValidationError(f"Agent {data['current_assignee_agent_id']} does not exist")

        self._validate_blocked_reason(data, existing)

        assignee_changed = (
            "current_assignee_agent_id" in data
            and data["current_assignee_agent_id"] != existing.current_assignee_agent_id
        )
        data["updated_by"] = actor
        data["updated_at"] = now

        if assignee_changed:
            updated = await self._repo.update_assignee_with_event(
                work_item_id=work_item_id,
                data=data,
                new_assignee_agent_id=data["current_assignee_agent_id"],
                previous_assignee_agent_id=existing.current_assignee_agent_id,
                actor_id=actor,
                occurred_at=now,
                correlation_id=new_uuid(),
                causation_id=work_item_id,
            )
        else:
            updated = await self._repo.update(work_item_id, data)

        if not updated:
            raise NotFoundError(f"Work item {work_item_id} not found")

        if assignee_changed:
            await self._notify_assignment_changed(
                updated,
                agent_id=data.get("current_assignee_agent_id"),
                previous_agent_id=existing.current_assignee_agent_id,
            )
            await self._repo.commit()

        # Recompute parent derived status when child status changes.
        if "status" in data and existing.parent_id:
            await self._repo.recompute_derived_status(existing.parent_id)

        return updated

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def delete_work_item(self, work_item_id: str) -> None:
        deleted = await self._repo.delete(work_item_id)
        if not deleted:
            raise NotFoundError(f"Work item {work_item_id} not found")

    # ------------------------------------------------------------------
    # Labels
    # ------------------------------------------------------------------

    async def get_labels(self, work_item_id: str) -> list[dict[str, Any]]:
        return await self._repo.get_labels(work_item_id)

    async def attach_label(self, work_item_id: str, label_id: str) -> None:
        if not await self._repo.get_by_id(work_item_id):
            raise NotFoundError(f"Work item {work_item_id} not found")
        if not await self._repo.label_exists(label_id):
            raise ValidationError(f"Label {label_id} does not exist")
        if await self._repo.label_attached(work_item_id, label_id):
            raise ConflictError(f"Label {label_id} already attached to {work_item_id}")
        await self._repo.attach_label(work_item_id, label_id)

    async def detach_label(self, work_item_id: str, label_id: str) -> None:
        if not await self._repo.get_by_id(work_item_id):
            raise NotFoundError(f"Work item {work_item_id} not found")
        removed = await self._repo.detach_label(work_item_id, label_id)
        if not removed:
            raise NotFoundError(f"Label {label_id} not attached to {work_item_id}")

    # ------------------------------------------------------------------
    # Assignments
    # ------------------------------------------------------------------

    async def assign_agent(
        self,
        work_item_id: str,
        agent_id: str,
        *,
        assigned_by: str | None = None,
    ) -> WorkItemAssignment:
        item = await self._repo.get_by_id(work_item_id)
        if not item:
            raise NotFoundError(f"Work item {work_item_id} not found")
        if not await self._repo.agent_exists(agent_id):
            raise ValidationError(f"Agent {agent_id} does not exist")

        active = await self._repo.get_active_assignment(work_item_id)
        if active and active.agent_id == agent_id:
            raise ConflictError(f"Agent {agent_id} already assigned to {work_item_id}")
        now = utc_now()
        assignment = await self._repo.assign_agent_with_event(
            work_item_id=work_item_id,
            agent_id=agent_id,
            previous_assignee_agent_id=active.agent_id if active else None,
            assigned_by=assigned_by,
            occurred_at=now,
            correlation_id=new_uuid(),
            causation_id=work_item_id,
        )
        await self._notify_assignment_changed(
            item,
            agent_id=agent_id,
            previous_agent_id=active.agent_id if active else None,
        )
        await self._repo.commit()
        return assignment

    async def unassign_current_agent(self, work_item_id: str) -> None:
        item = await self._repo.get_by_id(work_item_id)
        if not item:
            raise NotFoundError(f"Work item {work_item_id} not found")

        active = await self._repo.get_active_assignment(work_item_id)
        if not active:
            raise NotFoundError(f"No active assignment on {work_item_id}")

        await self._repo.unassign_agent_with_event(
            work_item_id=work_item_id,
            previous_assignee_agent_id=active.agent_id,
            occurred_at=utc_now(),
            correlation_id=new_uuid(),
            causation_id=work_item_id,
        )
        await self._notify_assignment_changed(
            item,
            agent_id=None,
            previous_agent_id=active.agent_id,
        )
        await self._repo.commit()

    async def list_assignments(self, work_item_id: str) -> list[WorkItemAssignment]:
        if not await self._repo.get_by_id(work_item_id):
            raise NotFoundError(f"Work item {work_item_id} not found")
        return await self._repo.get_assignments(work_item_id)

    # ------------------------------------------------------------------
    # Progress
    # ------------------------------------------------------------------

    async def get_children_progress(self, parent_id: str | None) -> dict[str, int]:
        if not parent_id:
            return {}
        total, done = await self._repo.get_children_progress(parent_id)
        return {"children_total": total, "children_done": done}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _apply_status_transition(
        self,
        work_item_id: str,
        data: dict[str, Any],
        existing: WorkItem,
        now: str,
    ) -> None:
        new_status = data["status"]
        valid = {s.value for s in WorkItemStatus}
        if new_status not in valid:
            raise ValidationError(
                f"Invalid status '{new_status}'. " f"Allowed: {', '.join(sorted(valid))}"
            )

        next_is_blocked = data.get("is_blocked", existing.is_blocked)
        if new_status == WorkItemStatus.DONE and next_is_blocked:
            raise BusinessRuleError("Blocked work item cannot be moved to DONE")

        if new_status == WorkItemStatus.DONE:
            data["completed_at"] = now
            await self._repo.close_assignment(work_item_id, now)
        elif existing.status == WorkItemStatus.DONE:
            data["completed_at"] = None

        if new_status == WorkItemStatus.IN_PROGRESS and existing.started_at is None:
            data["started_at"] = now

    def _validate_blocked_reason(self, data: dict[str, Any], existing: WorkItem) -> None:
        next_is_blocked = data.get("is_blocked", existing.is_blocked)
        blocked_reason_in_payload = "blocked_reason" in data
        blocked_reason = data.get("blocked_reason", existing.blocked_reason)

        if blocked_reason_in_payload and blocked_reason is not None and not next_is_blocked:
            raise BusinessRuleError("blocked_reason can be set only when is_blocked is true")
        if not next_is_blocked:
            data["blocked_reason"] = None

    async def _notify_assignment_changed(
        self,
        item: WorkItem,
        *,
        agent_id: str | None,
        previous_agent_id: str | None,
    ) -> None:
        if self._on_assignment_changed is None:
            return
        await self._on_assignment_changed(
            work_item_id=item.id,
            work_item_key=item.key,
            work_item_type=item.type.value,
            work_item_title=item.title,
            work_item_status=item.status.value,
            project_id=item.project_id,
            agent_id=agent_id,
            previous_agent_id=previous_agent_id,
        )

    @staticmethod
    def _validate_type(type_value: str) -> None:
        valid = {t.value for t in WorkItemType}
        if type_value not in valid:
            raise ValidationError(
                f"Invalid type '{type_value}'. " f"Allowed: {', '.join(sorted(valid))}"
            )
