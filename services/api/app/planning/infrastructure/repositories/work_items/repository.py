from typing import Any

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.planning.application.ports.work_item import WorkItemRepository
from app.planning.domain.models import (
    WorkItem,
    WorkItemAssignment,
    WorkItemOverview,
    WorkItemStatus,
)
from app.planning.infrastructure.repositories.work_items import _assignments
from app.planning.infrastructure.repositories.work_items._overview import (
    list_overview as _list_overview,
)
from app.planning.infrastructure.shared.mappers import _row_to_work_item
from app.planning.infrastructure.shared.sorting import parse_sort
from app.planning.infrastructure.shared.sql import affected_rows
from app.planning.infrastructure.tables import (
    agents,
    backlog_items,
    backlogs,
    labels,
    project_counters,
    projects,
    work_item_labels,
    work_items,
)
from app.shared.utils import utc_now

_SORT_ALLOWED = {
    "created_at": work_items.c.created_at,
    "updated_at": work_items.c.updated_at,
    "title": work_items.c.title,
    "priority": work_items.c.priority,
    "status": work_items.c.status,
    "type": work_items.c.type,
    "key": work_items.c.key,
}


class DbWorkItemRepository(WorkItemRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def list_all(
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
    ) -> tuple[list[WorkItem], int]:
        conditions = self._build_conditions(
            type=type,
            project_id=project_id,
            parent_id=parent_id,
            status=status,
            assignee_id=assignee_id,
            key=key,
            sub_type=sub_type,
            is_blocked=is_blocked,
            text_search=text_search,
        )
        return await self._query_list(conditions, limit, offset, sort)

    async def list_enriched(
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
        conditions = self._build_conditions(
            type=type,
            project_id=project_id,
            parent_id=parent_id,
            status=status,
            assignee_id=assignee_id,
            key=key,
            sub_type=sub_type,
            is_blocked=is_blocked,
            text_search=text_search,
        )
        return await self._query_list_enriched(conditions, limit, offset, sort)

    async def get_by_id(self, work_item_id: str) -> WorkItem | None:
        row = (
            (await self._db.execute(select(work_items).where(work_items.c.id == work_item_id)))
            .mappings()
            .first()
        )
        return _row_to_work_item(row) if row else None

    async def get_by_key(self, key: str) -> WorkItem | None:
        row = (
            (await self._db.execute(select(work_items).where(work_items.c.key == key.upper())))
            .mappings()
            .first()
        )
        return _row_to_work_item(row) if row else None

    async def create(self, work_item: WorkItem) -> WorkItem:
        await self._db.execute(
            insert(work_items).values(
                id=work_item.id,
                project_id=work_item.project_id,
                parent_id=work_item.parent_id,
                key=work_item.key,
                type=work_item.type.value,
                sub_type=work_item.sub_type,
                title=work_item.title,
                summary=work_item.summary,
                description=work_item.description,
                status=work_item.status.value,
                status_mode=work_item.status_mode.value,
                status_override=work_item.status_override,
                status_override_set_at=work_item.status_override_set_at,
                is_blocked=1 if work_item.is_blocked else 0,
                blocked_reason=work_item.blocked_reason,
                priority=work_item.priority,
                estimate_points=work_item.estimate_points,
                due_at=work_item.due_at,
                current_assignee_agent_id=work_item.current_assignee_agent_id,
                metadata_json=work_item.metadata_json,
                created_by=work_item.created_by,
                updated_by=work_item.updated_by,
                created_at=work_item.created_at,
                updated_at=work_item.updated_at,
                started_at=work_item.started_at,
                completed_at=work_item.completed_at,
            )
        )
        await self._db.commit()
        return work_item

    async def create_in_backlog(self, work_item: WorkItem, backlog_id: str) -> WorkItem:
        await self._db.execute(
            insert(work_items).values(
                id=work_item.id,
                project_id=work_item.project_id,
                parent_id=work_item.parent_id,
                key=work_item.key,
                type=work_item.type.value,
                sub_type=work_item.sub_type,
                title=work_item.title,
                summary=work_item.summary,
                description=work_item.description,
                status=work_item.status.value,
                status_mode=work_item.status_mode.value,
                status_override=work_item.status_override,
                status_override_set_at=work_item.status_override_set_at,
                is_blocked=1 if work_item.is_blocked else 0,
                blocked_reason=work_item.blocked_reason,
                priority=work_item.priority,
                estimate_points=work_item.estimate_points,
                due_at=work_item.due_at,
                current_assignee_agent_id=work_item.current_assignee_agent_id,
                metadata_json=work_item.metadata_json,
                created_by=work_item.created_by,
                updated_by=work_item.updated_by,
                created_at=work_item.created_at,
                updated_at=work_item.updated_at,
                started_at=work_item.started_at,
                completed_at=work_item.completed_at,
            )
        )
        await self._db.execute(
            insert(backlog_items).values(
                backlog_id=backlog_id,
                work_item_id=work_item.id,
                rank="n",
                added_at=work_item.created_at,
            )
        )
        await self._db.commit()
        return work_item

    async def update(self, work_item_id: str, data: dict[str, Any]) -> WorkItem | None:
        allowed = {
            "title",
            "summary",
            "description",
            "sub_type",
            "status",
            "status_mode",
            "status_override",
            "status_override_set_at",
            "parent_id",
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
            return await self.get_by_id(work_item_id)

        if "is_blocked" in values:
            values["is_blocked"] = 1 if values["is_blocked"] else 0

        await self._db.execute(
            update(work_items).where(work_items.c.id == work_item_id).values(**values)
        )
        await self._db.commit()
        return await self.get_by_id(work_item_id)

    async def delete(self, work_item_id: str) -> bool:
        result = await self._db.execute(delete(work_items).where(work_items.c.id == work_item_id))
        await self._db.commit()
        return affected_rows(result) > 0

    # ------------------------------------------------------------------
    # Hierarchy
    # ------------------------------------------------------------------

    async def list_children(
        self,
        parent_id: str,
        *,
        type: str | None = None,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[WorkItem], int]:
        conditions = [work_items.c.parent_id == parent_id]
        if type:
            conditions.append(work_items.c.type == type)
        if status:
            conditions.append(work_items.c.status == status)
        return await self._query_list(conditions, limit, offset, sort)

    async def get_children_count(self, work_item_id: str) -> int:
        result = await self._db.execute(
            select(func.count())
            .select_from(work_items)
            .where(work_items.c.parent_id == work_item_id)
        )
        return result.scalar_one()

    async def get_children_progress(self, parent_id: str) -> tuple[int, int]:
        total = await self._db.execute(
            select(func.count()).select_from(work_items).where(work_items.c.parent_id == parent_id)
        )
        done = await self._db.execute(
            select(func.count())
            .select_from(work_items)
            .where(
                work_items.c.parent_id == parent_id,
                work_items.c.status == WorkItemStatus.DONE.value,
            )
        )
        return total.scalar_one(), done.scalar_one()

    # ------------------------------------------------------------------
    # Overview
    # ------------------------------------------------------------------

    async def list_overview(self, **kwargs: Any) -> tuple[list[WorkItemOverview], int]:
        return await _list_overview(self._db, **kwargs)

    # ------------------------------------------------------------------
    # Key allocation
    # ------------------------------------------------------------------

    async def allocate_key(self, project_id: str) -> str:
        proj_row = (
            (await self._db.execute(select(projects.c.key).where(projects.c.id == project_id)))
            .mappings()
            .first()
        )
        if not proj_row:
            msg = f"Project {project_id} not found"
            raise ValueError(msg)

        counter_row = (
            (
                await self._db.execute(
                    select(project_counters).where(project_counters.c.project_id == project_id)
                )
            )
            .mappings()
            .first()
        )
        if not counter_row:
            msg = f"Counter for project {project_id} not found"
            raise ValueError(msg)

        next_num = counter_row["next_number"]
        await self._db.execute(
            update(project_counters)
            .where(project_counters.c.project_id == project_id)
            .values(next_number=next_num + 1, updated_at=utc_now())
        )
        return f"{proj_row['key']}-{next_num}"

    # ------------------------------------------------------------------
    # Existence checks
    # ------------------------------------------------------------------

    async def project_exists(self, project_id: str) -> bool:
        row = await self._db.execute(
            select(func.count()).select_from(projects).where(projects.c.id == project_id)
        )
        return row.scalar_one() > 0

    async def agent_exists(self, agent_id: str) -> bool:
        row = await self._db.execute(
            select(func.count()).select_from(agents).where(agents.c.id == agent_id)
        )
        return row.scalar_one() > 0

    async def label_exists(self, label_id: str) -> bool:
        row = await self._db.execute(
            select(func.count()).select_from(labels).where(labels.c.id == label_id)
        )
        return row.scalar_one() > 0

    async def backlog_exists(self, backlog_id: str) -> bool:
        row = await self._db.execute(
            select(func.count()).select_from(backlogs).where(backlogs.c.id == backlog_id)
        )
        return row.scalar_one() > 0

    async def parent_exists(self, parent_id: str) -> WorkItem | None:
        return await self.get_by_id(parent_id)

    # ------------------------------------------------------------------
    # Labels
    # ------------------------------------------------------------------

    async def get_labels(self, work_item_id: str) -> list[dict[str, Any]]:
        q = (
            select(
                labels.c.id.label("label_id"),
                labels.c.name,
                labels.c.color,
            )
            .select_from(work_item_labels.join(labels, work_item_labels.c.label_id == labels.c.id))
            .where(work_item_labels.c.work_item_id == work_item_id)
        )
        rows = (await self._db.execute(q)).mappings().all()
        return [{"id": r["label_id"], "name": r["name"], "color": r["color"]} for r in rows]

    async def label_attached(self, work_item_id: str, label_id: str) -> bool:
        row = await self._db.execute(
            select(func.count())
            .select_from(work_item_labels)
            .where(
                work_item_labels.c.work_item_id == work_item_id,
                work_item_labels.c.label_id == label_id,
            )
        )
        return row.scalar_one() > 0

    async def attach_label(self, work_item_id: str, label_id: str) -> None:
        await self._db.execute(
            insert(work_item_labels).values(
                work_item_id=work_item_id,
                label_id=label_id,
                added_at=utc_now(),
            )
        )
        await self._db.commit()

    async def detach_label(self, work_item_id: str, label_id: str) -> bool:
        result = await self._db.execute(
            delete(work_item_labels).where(
                work_item_labels.c.work_item_id == work_item_id,
                work_item_labels.c.label_id == label_id,
            )
        )
        await self._db.commit()
        return affected_rows(result) > 0

    # ------------------------------------------------------------------
    # Assignments (delegates)
    # ------------------------------------------------------------------

    async def get_active_assignment(self, work_item_id: str) -> WorkItemAssignment | None:
        return await _assignments.get_active_assignment(self._db, work_item_id)

    async def get_assignments(self, work_item_id: str) -> list[WorkItemAssignment]:
        return await _assignments.get_assignments(self._db, work_item_id)

    async def create_assignment(self, assignment: WorkItemAssignment) -> WorkItemAssignment:
        return await _assignments.create_assignment(self._db, assignment)

    async def close_assignment(self, work_item_id: str, unassigned_at: str) -> bool:
        return await _assignments.close_assignment(self._db, work_item_id, unassigned_at)

    async def assign_agent_with_event(
        self,
        *,
        work_item_id: str,
        agent_id: str,
        previous_assignee_agent_id: str | None,
        assigned_by: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> WorkItemAssignment:
        return await _assignments.assign_agent_with_event(
            self._db,
            work_item_id=work_item_id,
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
        work_item_id: str,
        previous_assignee_agent_id: str,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> bool:
        return await _assignments.unassign_agent_with_event(
            self._db,
            work_item_id=work_item_id,
            previous_assignee_agent_id=previous_assignee_agent_id,
            occurred_at=occurred_at,
            correlation_id=correlation_id,
            causation_id=causation_id,
        )

    async def update_assignee_with_event(
        self,
        *,
        work_item_id: str,
        data: dict[str, Any],
        new_assignee_agent_id: str | None,
        previous_assignee_agent_id: str | None,
        actor_id: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> WorkItem | None:
        updated = await self.update(work_item_id, data)
        if not updated:
            return None

        item_key = updated.key
        from app.planning.infrastructure.shared.events import (
            insert_assignment_event,
        )

        await insert_assignment_event(
            self._db,
            actor_id=actor_id,
            entity_type="work_item",
            entity_id=work_item_id,
            work_item_key=item_key,
            new_assignee_agent_id=new_assignee_agent_id,
            previous_assignee_agent_id=previous_assignee_agent_id,
            occurred_at=occurred_at,
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        await self._db.commit()
        return updated

    # ------------------------------------------------------------------
    # Derived status
    # ------------------------------------------------------------------

    async def get_parent_id(self, work_item_id: str) -> str | None:
        row = (
            (
                await self._db.execute(
                    select(work_items.c.parent_id).where(work_items.c.id == work_item_id)
                )
            )
            .mappings()
            .first()
        )
        return row["parent_id"] if row else None

    async def recompute_derived_status(self, parent_id: str) -> None:
        parent = await self.get_by_id(parent_id)
        if not parent or parent.status_mode.value != "DERIVED":
            return

        total, done = await self.get_children_progress(parent_id)
        if total == 0:
            return

        in_progress_count = (
            await self._db.execute(
                select(func.count())
                .select_from(work_items)
                .where(
                    work_items.c.parent_id == parent_id,
                    work_items.c.status != WorkItemStatus.DONE.value,
                    work_items.c.status != WorkItemStatus.TODO.value,
                )
            )
        ).scalar_one()
        todo_count = total - done - in_progress_count

        if done == total:
            derived = WorkItemStatus.DONE.value
        elif todo_count == total:
            derived = WorkItemStatus.TODO.value
        else:
            derived = WorkItemStatus.IN_PROGRESS.value

        await self._db.execute(
            update(work_items)
            .where(work_items.c.id == parent_id)
            .values(
                status=derived,
                status_override=None,
                status_override_set_at=None,
                updated_at=utc_now(),
            )
        )
        await self._db.commit()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_conditions(
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
    ) -> list[Any]:
        conditions: list[Any] = []
        if type:
            conditions.append(work_items.c.type == type)
        if project_id:
            conditions.append(work_items.c.project_id == project_id)
        if parent_id:
            conditions.append(work_items.c.parent_id == parent_id)
        if status:
            conditions.append(work_items.c.status == status)
        if assignee_id:
            conditions.append(work_items.c.current_assignee_agent_id == assignee_id)
        if key:
            conditions.append(work_items.c.key == key)
        if sub_type:
            conditions.append(work_items.c.sub_type == sub_type)
        if is_blocked is not None:
            conditions.append(work_items.c.is_blocked == (1 if is_blocked else 0))
        if text_search:
            pattern = f"%{text_search}%"
            conditions.append(work_items.c.title.ilike(pattern) | work_items.c.key.ilike(pattern))
        return conditions

    async def _query_list(
        self,
        conditions: list[Any],
        limit: int,
        offset: int,
        sort: str,
    ) -> tuple[list[WorkItem], int]:
        order = parse_sort(sort, _SORT_ALLOWED)
        if not order:
            order = [work_items.c.created_at.desc()]

        count_q = select(func.count()).select_from(work_items)
        select_q = select(work_items)
        for cond in conditions:
            count_q = count_q.where(cond)
            select_q = select_q.where(cond)
        select_q = select_q.order_by(*order).limit(limit).offset(offset)

        total = (await self._db.execute(count_q)).scalar_one()
        rows = (await self._db.execute(select_q)).mappings().all()
        return [_row_to_work_item(r) for r in rows], total

    async def _query_list_enriched(
        self,
        conditions: list[Any],
        limit: int,
        offset: int,
        sort: str,
    ) -> tuple[list[dict[str, Any]], int]:
        order = parse_sort(sort, _SORT_ALLOWED)
        if not order:
            order = [work_items.c.created_at.desc()]

        parent = work_items.alias("parent")
        children = work_items.alias("children")

        children_count = (
            select(func.count())
            .where(children.c.parent_id == work_items.c.id)
            .correlate(work_items)
            .scalar_subquery()
            .label("children_count")
        )
        done_children_count = (
            select(func.count())
            .where(
                children.c.parent_id == work_items.c.id,
                children.c.status == "DONE",
            )
            .correlate(work_items)
            .scalar_subquery()
            .label("done_children_count")
        )

        count_q = select(func.count()).select_from(work_items)
        select_q = select(
            work_items,
            parent.c.key.label("parent_key"),
            parent.c.title.label("parent_title"),
            children_count,
            done_children_count,
        ).select_from(work_items.outerjoin(parent, work_items.c.parent_id == parent.c.id))
        for cond in conditions:
            count_q = count_q.where(cond)
            select_q = select_q.where(cond)
        select_q = select_q.order_by(*order).limit(limit).offset(offset)

        total = (await self._db.execute(count_q)).scalar_one()
        rows = (await self._db.execute(select_q)).mappings().all()

        item_ids = [r["id"] for r in rows]
        labels_by_item: dict[str, list[dict[str, Any]]] = {iid: [] for iid in item_ids}
        if item_ids:
            lq = (
                select(
                    work_item_labels.c.work_item_id,
                    labels.c.id.label("label_id"),
                    labels.c.name,
                    labels.c.color,
                )
                .select_from(
                    work_item_labels.join(
                        labels,
                        work_item_labels.c.label_id == labels.c.id,
                    )
                )
                .where(work_item_labels.c.work_item_id.in_(item_ids))
            )
            for lr in (await self._db.execute(lq)).mappings().all():
                wid = lr["work_item_id"]
                if wid in labels_by_item:
                    labels_by_item[wid].append(
                        {
                            "id": lr["label_id"],
                            "name": lr["name"],
                            "color": lr["color"],
                        }
                    )

        result = []
        for r in rows:
            item = _row_to_work_item(r)
            d = _to_enriched_dict(item)
            d["parent_key"] = r["parent_key"]
            d["parent_title"] = r["parent_title"]
            d["children_count"] = r["children_count"]
            d["done_children_count"] = r["done_children_count"]
            item_labels = labels_by_item.get(d["id"], [])
            d["labels"] = item_labels
            d["label_ids"] = [la["id"] for la in item_labels]
            result.append(d)
        return result, total


def _to_enriched_dict(item: WorkItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "type": item.type.value,
        "project_id": item.project_id,
        "parent_id": item.parent_id,
        "key": item.key,
        "title": item.title,
        "sub_type": item.sub_type,
        "summary": item.summary,
        "description": item.description,
        "status": item.status.value,
        "status_mode": item.status_mode.value,
        "status_override": item.status_override,
        "is_blocked": item.is_blocked,
        "blocked_reason": item.blocked_reason,
        "priority": item.priority,
        "estimate_points": item.estimate_points,
        "due_at": item.due_at,
        "current_assignee_agent_id": item.current_assignee_agent_id,
        "metadata_json": item.metadata_json,
        "created_by": item.created_by,
        "updated_by": item.updated_by,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "started_at": item.started_at,
        "completed_at": item.completed_at,
    }
