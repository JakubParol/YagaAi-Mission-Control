from typing import Any

from sqlalchemy import case, delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.planning.application.ports.backlog import BacklogRepository
from app.planning.domain.models import Backlog, BacklogItem
from app.planning.infrastructure.shared.mappers import _row_to_backlog
from app.planning.infrastructure.shared.sorting import parse_sort
from app.planning.infrastructure.shared.sql import affected_rows
from app.planning.infrastructure.tables import (
    agents,
    backlog_items,
    backlogs,
    labels,
    work_item_labels,
    work_items,
)
from app.shared.lexorank import rank_after as lr_after
from app.shared.utils import utc_now

_SORT_ALLOWED_BACKLOG = {
    "created_at": backlogs.c.created_at,
    "updated_at": backlogs.c.updated_at,
    "name": backlogs.c.name,
    "rank": backlogs.c.rank,
}

_BACKLOG_PRIORITY_EXPR = case(
    (
        (backlogs.c.kind == "SPRINT") & (backlogs.c.status == "ACTIVE"),
        0,
    ),
    (backlogs.c.is_default == 1, 2),
    else_=1,
)


class DbBacklogRepository(BacklogRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def list_all(
        self,
        *,
        project_id: str | None = None,
        filter_global: bool = False,
        status: str | None = None,
        kind: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str | None = None,
    ) -> tuple[list[Backlog], int]:
        conditions: list[Any] = []
        if filter_global:
            conditions.append(backlogs.c.project_id.is_(None))
        elif project_id:
            conditions.append(backlogs.c.project_id == project_id)

        if status:
            conditions.append(backlogs.c.status == status)
        if kind:
            conditions.append(backlogs.c.kind == kind)

        if sort:
            user_order = parse_sort(sort, _SORT_ALLOWED_BACKLOG)
        else:
            user_order = [backlogs.c.rank.asc()]

        order = [
            _BACKLOG_PRIORITY_EXPR.asc(),
            *user_order,
            backlogs.c.id.asc(),
        ]

        count_q = select(func.count()).select_from(backlogs)
        select_q = select(backlogs)
        for cond in conditions:
            count_q = count_q.where(cond)
            select_q = select_q.where(cond)
        select_q = select_q.order_by(*order).limit(limit).offset(offset)

        total = (await self._db.execute(count_q)).scalar_one()
        rows = (await self._db.execute(select_q)).mappings().all()
        return [_row_to_backlog(r) for r in rows], total

    async def get_by_id(self, backlog_id: str) -> Backlog | None:
        row = (
            (await self._db.execute(select(backlogs).where(backlogs.c.id == backlog_id)))
            .mappings()
            .first()
        )
        return _row_to_backlog(row) if row else None

    async def create(self, backlog: Backlog) -> Backlog:
        await self._db.execute(
            insert(backlogs).values(
                id=backlog.id,
                project_id=backlog.project_id,
                name=backlog.name,
                kind=backlog.kind.value,
                status=backlog.status.value,
                rank=backlog.rank,
                is_default=1 if backlog.is_default else 0,
                goal=backlog.goal,
                start_date=backlog.start_date,
                end_date=backlog.end_date,
                metadata_json=backlog.metadata_json,
                created_by=backlog.created_by,
                updated_by=backlog.updated_by,
                created_at=backlog.created_at,
                updated_at=backlog.updated_at,
            )
        )
        await self._db.commit()
        return backlog

    async def update(self, backlog_id: str, data: dict[str, Any]) -> Backlog | None:
        allowed = {
            "name",
            "kind",
            "status",
            "rank",
            "is_default",
            "goal",
            "start_date",
            "end_date",
            "metadata_json",
            "updated_by",
            "updated_at",
        }
        values = {k: v for k, v in data.items() if k in allowed}
        if not values:
            return await self.get_by_id(backlog_id)

        if "is_default" in values:
            values["is_default"] = 1 if values["is_default"] else 0

        await self._db.execute(update(backlogs).where(backlogs.c.id == backlog_id).values(**values))
        await self._db.commit()
        return await self.get_by_id(backlog_id)

    async def delete(self, backlog_id: str) -> bool:
        result = await self._db.execute(delete(backlogs).where(backlogs.c.id == backlog_id))
        await self._db.commit()
        return affected_rows(result) > 0

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    async def has_default(self, project_id: str | None) -> bool:
        q = select(func.count()).select_from(backlogs).where(backlogs.c.is_default == 1)
        if project_id:
            q = q.where(backlogs.c.project_id == project_id)
        else:
            q = q.where(backlogs.c.project_id.is_(None))
        result = await self._db.execute(q)
        return result.scalar_one() > 0

    async def next_rank(self, project_id: str | None) -> str:
        q = select(backlogs.c.rank).order_by(backlogs.c.rank.desc()).limit(1)
        if project_id:
            q = q.where(backlogs.c.project_id == project_id)
        else:
            q = q.where(backlogs.c.project_id.is_(None))
        row = (await self._db.execute(q)).scalars().first()
        if row:
            return lr_after(row)
        return "n"

    async def get_item_count(self, backlog_id: str) -> int:
        result = await self._db.execute(
            select(func.count())
            .select_from(backlog_items)
            .where(backlog_items.c.backlog_id == backlog_id)
        )
        return result.scalar_one()

    # ------------------------------------------------------------------
    # Item membership
    # ------------------------------------------------------------------

    async def work_item_backlog_id(self, work_item_id: str) -> str | None:
        row = (
            (
                await self._db.execute(
                    select(backlog_items.c.backlog_id).where(
                        backlog_items.c.work_item_id == work_item_id
                    )
                )
            )
            .scalars()
            .first()
        )
        return row

    async def get_work_item_project_id(self, work_item_id: str) -> tuple[bool, str | None]:
        row = (
            (
                await self._db.execute(
                    select(work_items.c.project_id).where(work_items.c.id == work_item_id)
                )
            )
            .mappings()
            .first()
        )
        if not row:
            return False, None
        return True, row["project_id"]

    async def add_item(self, backlog_id: str, work_item_id: str, rank: str) -> BacklogItem:
        now = utc_now()
        await self._db.execute(
            insert(backlog_items).values(
                backlog_id=backlog_id,
                work_item_id=work_item_id,
                rank=rank,
                added_at=now,
            )
        )
        await self._db.commit()
        return BacklogItem(
            backlog_id=backlog_id,
            work_item_id=work_item_id,
            rank=rank,
            added_at=now,
        )

    async def remove_item(self, backlog_id: str, work_item_id: str) -> bool:
        result = await self._db.execute(
            delete(backlog_items).where(
                backlog_items.c.backlog_id == backlog_id,
                backlog_items.c.work_item_id == work_item_id,
            )
        )
        await self._db.commit()
        return affected_rows(result) > 0

    async def list_items(self, backlog_id: str) -> list[dict[str, Any]]:
        parent = work_items.alias("parent")
        children = work_items.alias("children")
        assignee = agents.alias("assignee")

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

        q = (
            select(
                backlog_items.c.backlog_id,
                backlog_items.c.work_item_id,
                backlog_items.c.rank,
                backlog_items.c.added_at,
                work_items.c.id,
                work_items.c.key,
                work_items.c.title,
                work_items.c.type,
                work_items.c.sub_type,
                work_items.c.status,
                work_items.c.priority,
                work_items.c.parent_id,
                parent.c.key.label("parent_key"),
                parent.c.title.label("parent_title"),
                work_items.c.current_assignee_agent_id,
                assignee.c.name.label("assignee_name"),
                assignee.c.last_name.label("assignee_last_name"),
                assignee.c.initials.label("assignee_initials"),
                assignee.c.avatar.label("assignee_avatar"),
                work_items.c.is_blocked,
                children_count,
                done_children_count,
            )
            .select_from(
                backlog_items.join(
                    work_items,
                    backlog_items.c.work_item_id == work_items.c.id,
                )
                .outerjoin(
                    parent,
                    work_items.c.parent_id == parent.c.id,
                )
                .outerjoin(
                    assignee,
                    work_items.c.current_assignee_agent_id == assignee.c.id,
                )
            )
            .where(backlog_items.c.backlog_id == backlog_id)
            .order_by(backlog_items.c.rank.asc())
        )
        rows = (await self._db.execute(q)).mappings().all()

        # Enrich with labels
        item_ids = [r["id"] for r in rows]
        labels_by_item: dict[str, list[dict[str, Any]]] = {item_id: [] for item_id in item_ids}
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
            label_rows = (await self._db.execute(lq)).mappings().all()
            for lr in label_rows:
                wid = lr["work_item_id"]
                if wid in labels_by_item:
                    labels_by_item[wid].append(
                        {"id": lr["label_id"], "name": lr["name"], "color": lr["color"]}
                    )

        result = []
        for r in rows:
            d = dict(r)
            item_labels = labels_by_item.get(d["id"], [])
            d["labels"] = item_labels
            d["label_ids"] = [l["id"] for l in item_labels]
            d["assignee_agent_id"] = d.get("current_assignee_agent_id")
            result.append(d)
        return result

    async def list_items_batch(self, backlog_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        if not backlog_ids:
            return {}

        parent = work_items.alias("parent")
        children = work_items.alias("children")
        assignee = agents.alias("assignee")

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

        q = (
            select(
                backlog_items.c.backlog_id,
                backlog_items.c.work_item_id,
                backlog_items.c.rank,
                backlog_items.c.added_at,
                work_items.c.id,
                work_items.c.key,
                work_items.c.title,
                work_items.c.type,
                work_items.c.sub_type,
                work_items.c.status,
                work_items.c.priority,
                work_items.c.parent_id,
                parent.c.key.label("parent_key"),
                parent.c.title.label("parent_title"),
                work_items.c.current_assignee_agent_id,
                assignee.c.name.label("assignee_name"),
                assignee.c.last_name.label("assignee_last_name"),
                assignee.c.initials.label("assignee_initials"),
                assignee.c.avatar.label("assignee_avatar"),
                work_items.c.is_blocked,
                children_count,
                done_children_count,
            )
            .select_from(
                backlog_items.join(
                    work_items,
                    backlog_items.c.work_item_id == work_items.c.id,
                )
                .outerjoin(
                    parent,
                    work_items.c.parent_id == parent.c.id,
                )
                .outerjoin(
                    assignee,
                    work_items.c.current_assignee_agent_id == assignee.c.id,
                )
            )
            .where(backlog_items.c.backlog_id.in_(backlog_ids))
            .order_by(
                backlog_items.c.backlog_id.asc(),
                backlog_items.c.rank.asc(),
            )
        )
        rows = (await self._db.execute(q)).mappings().all()

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

        grouped: dict[str, list[dict[str, Any]]] = {bid: [] for bid in backlog_ids}
        for r in rows:
            d = dict(r)
            il = labels_by_item.get(d["id"], [])
            d["labels"] = il
            d["label_ids"] = [la["id"] for la in il]
            d["assignee_agent_id"] = d.get("current_assignee_agent_id")
            grouped[d["backlog_id"]].append(d)
        return grouped

    async def update_item_rank(self, backlog_id: str, work_item_id: str, rank: str) -> bool:
        result = await self._db.execute(
            update(backlog_items)
            .where(
                backlog_items.c.backlog_id == backlog_id,
                backlog_items.c.work_item_id == work_item_id,
            )
            .values(rank=rank)
        )
        await self._db.commit()
        return affected_rows(result) > 0

    # ------------------------------------------------------------------
    # Sprint helpers
    # ------------------------------------------------------------------

    async def get_active_sprint_with_items(
        self, project_id: str
    ) -> tuple[Backlog | None, list[dict[str, Any]]]:
        backlog = await self.get_active_sprint_backlog(project_id)
        if not backlog:
            return None, []
        items = await self.list_items(backlog.id)
        return backlog, items

    async def get_active_sprint_backlog(self, project_id: str) -> Backlog | None:
        row = (
            (
                await self._db.execute(
                    select(backlogs).where(
                        backlogs.c.project_id == project_id,
                        backlogs.c.kind == "SPRINT",
                        backlogs.c.status == "ACTIVE",
                    )
                )
            )
            .mappings()
            .first()
        )
        return _row_to_backlog(row) if row else None

    async def get_product_backlog(self, project_id: str) -> Backlog | None:
        row = (
            (
                await self._db.execute(
                    select(backlogs).where(
                        backlogs.c.project_id == project_id,
                        backlogs.c.is_default == 1,
                    )
                )
            )
            .mappings()
            .first()
        )
        return _row_to_backlog(row) if row else None

    # ------------------------------------------------------------------
    # Item movement
    # ------------------------------------------------------------------

    async def get_item_backlog_info(self, work_item_id: str) -> tuple[str | None, str | None]:
        row = (
            (
                await self._db.execute(
                    select(
                        backlog_items.c.backlog_id,
                        backlog_items.c.rank,
                    ).where(backlog_items.c.work_item_id == work_item_id)
                )
            )
            .mappings()
            .first()
        )
        if not row:
            return None, None
        return row["backlog_id"], row["rank"]

    async def move_item(
        self,
        *,
        source_backlog_id: str,
        target_backlog_id: str,
        work_item_id: str,
        rank: str,
    ) -> BacklogItem:
        await self._db.execute(
            delete(backlog_items).where(
                backlog_items.c.backlog_id == source_backlog_id,
                backlog_items.c.work_item_id == work_item_id,
            )
        )
        now = utc_now()
        await self._db.execute(
            insert(backlog_items).values(
                backlog_id=target_backlog_id,
                work_item_id=work_item_id,
                rank=rank,
                added_at=now,
            )
        )
        await self._db.commit()
        return BacklogItem(
            backlog_id=target_backlog_id,
            work_item_id=work_item_id,
            rank=rank,
            added_at=now,
        )

    async def move_non_done_items(
        self,
        *,
        source_backlog_id: str,
        target_backlog_id: str,
    ) -> int:
        # Find non-DONE items in source backlog.
        q = (
            select(backlog_items.c.work_item_id)
            .select_from(
                backlog_items.join(
                    work_items,
                    backlog_items.c.work_item_id == work_items.c.id,
                )
            )
            .where(
                backlog_items.c.backlog_id == source_backlog_id,
                work_items.c.status != "DONE",
            )
        )
        rows = (await self._db.execute(q)).scalars().all()
        if not rows:
            return 0

        # Get last rank in target for appending.
        target_items = await self.list_items(target_backlog_id)
        current_rank = target_items[-1]["rank"] if target_items else "m"

        now = utc_now()
        for wid in rows:
            await self._db.execute(
                delete(backlog_items).where(
                    backlog_items.c.backlog_id == source_backlog_id,
                    backlog_items.c.work_item_id == wid,
                )
            )
            current_rank = lr_after(current_rank)
            await self._db.execute(
                insert(backlog_items).values(
                    backlog_id=target_backlog_id,
                    work_item_id=wid,
                    rank=current_rank,
                    added_at=now,
                )
            )
        await self._db.commit()
        return len(rows)
