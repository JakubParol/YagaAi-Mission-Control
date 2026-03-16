from typing import Any
from typing import cast as type_cast

from sqlalchemy import case, delete, insert, select, text, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.functions import coalesce, count
from sqlalchemy.sql.functions import max as sa_max

from app.planning.application.ports import BacklogRepository
from app.planning.domain.models import Backlog, BacklogStoryItem, BacklogTaskItem
from app.planning.infrastructure.repositories.backlogs._membership import (
    add_story_item as _add_story_item,
)
from app.planning.infrastructure.repositories.backlogs._membership import (
    add_task_item as _add_task_item,
)
from app.planning.infrastructure.repositories.backlogs._membership import (
    list_task_items as _list_task_items,
)
from app.planning.infrastructure.repositories.backlogs._membership import (
    move_story_item as _move_story_item,
)
from app.planning.infrastructure.repositories.backlogs._membership import (
    remove_story_item as _remove_story_item,
)
from app.planning.infrastructure.repositories.backlogs._membership import (
    remove_task_item as _remove_task_item,
)
from app.planning.infrastructure.repositories.backlogs._membership import (
    reorder_items as _reorder_items,
)
from app.planning.infrastructure.repositories.backlogs._projection import (
    get_backlog_story_rows,
)
from app.planning.infrastructure.shared.mappers import _row_to_backlog
from app.planning.infrastructure.shared.sorting import parse_sort
from app.planning.infrastructure.tables import (
    backlog_stories,
    backlog_tasks,
    backlogs,
)
from app.planning.infrastructure.tables import stories as stories_t
from app.planning.infrastructure.tables import tasks as tasks_t

_SORT_ALLOWED_BACKLOG = {
    "created_at": backlogs.c.created_at,
    "updated_at": backlogs.c.updated_at,
    "name": backlogs.c.name,
    "display_order": backlogs.c.display_order,
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

    async def _repair_active_sprint_integrity(self) -> None:
        duplicate_q = (
            select(backlogs.c.project_id)
            .where(
                backlogs.c.project_id.isnot(None)
                & (backlogs.c.kind == "SPRINT")
                & (backlogs.c.status == "ACTIVE")
            )
            .group_by(backlogs.c.project_id)
            .having(count() > 1)
        )
        duplicate_rows = (await self._db.execute(duplicate_q)).mappings().all()

        for dup_row in duplicate_rows:
            project_id = dup_row["project_id"]
            keep_row = (
                (
                    await self._db.execute(
                        select(backlogs.c.id)
                        .where(
                            (backlogs.c.project_id == project_id)
                            & (backlogs.c.kind == "SPRINT")
                            & (backlogs.c.status == "ACTIVE")
                        )
                        .order_by(
                            backlogs.c.display_order.asc(),
                            backlogs.c.created_at.asc(),
                            backlogs.c.id.asc(),
                        )
                        .limit(1)
                    )
                )
                .mappings()
                .first()
            )
            if keep_row is None:
                continue
            await self._db.execute(
                update(backlogs)
                .where(
                    (backlogs.c.project_id == project_id)
                    & (backlogs.c.kind == "SPRINT")
                    & (backlogs.c.status == "ACTIVE")
                    & (backlogs.c.id != keep_row["id"])
                )
                .values(status="OPEN")
            )

        await self._db.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_backlogs_one_active_sprint_per_project "
                "ON backlogs (project_id) "
                "WHERE project_id IS NOT NULL AND kind = 'SPRINT' AND status = 'ACTIVE'"
            )
        )
        await self._db.commit()

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
        await self._repair_active_sprint_integrity()

        conditions = []
        if filter_global:
            conditions.append(backlogs.c.project_id.is_(None))
        elif project_id:
            conditions.append(backlogs.c.project_id == project_id)
        if status:
            conditions.append(backlogs.c.status == status)
        if kind:
            conditions.append(backlogs.c.kind == kind)

        if sort and sort.strip():
            user_order = parse_sort(sort, _SORT_ALLOWED_BACKLOG)
            order = [_BACKLOG_PRIORITY_EXPR.asc(), *user_order, backlogs.c.id.asc()]
        else:
            order = [
                _BACKLOG_PRIORITY_EXPR.asc(),
                backlogs.c.display_order.asc(),
                backlogs.c.created_at.asc(),
                backlogs.c.id.asc(),
            ]

        count_q = select(count()).select_from(backlogs)
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
                kind=backlog.kind,
                status=backlog.status,
                display_order=backlog.display_order,
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

    async def next_display_order(self, project_id: str | None) -> int:
        q = select(coalesce(sa_max(backlogs.c.display_order), 0))
        if project_id is None:
            q = q.where(backlogs.c.project_id.is_(None))
        else:
            q = q.where(backlogs.c.project_id == project_id)
        max_display_order = (await self._db.execute(q)).scalar_one()
        return int(max_display_order) + 100

    async def update(self, backlog_id: str, data: dict[str, Any]) -> Backlog | None:
        allowed = {
            "name",
            "kind",
            "status",
            "goal",
            "start_date",
            "end_date",
            "display_order",
            "metadata_json",
            "updated_by",
            "updated_at",
        }
        values = {k: v for k, v in data.items() if k in allowed}
        if not values:
            return await self.get_by_id(backlog_id)

        await self._db.execute(update(backlogs).where(backlogs.c.id == backlog_id).values(**values))
        await self._db.commit()
        return await self.get_by_id(backlog_id)

    async def delete(self, backlog_id: str) -> bool:
        result = type_cast(
            CursorResult,
            await self._db.execute(delete(backlogs).where(backlogs.c.id == backlog_id)),
        )
        await self._db.commit()
        return (result.rowcount or 0) > 0

    async def has_default(self, project_id: str | None) -> bool:
        q = select(backlogs.c.id).where(backlogs.c.is_default == 1)
        if project_id:
            q = q.where(backlogs.c.project_id == project_id)
        else:
            q = q.where(backlogs.c.project_id.is_(None))
        row = (await self._db.execute(q)).first()
        return row is not None

    async def get_story_count(self, backlog_id: str) -> int:
        result = await self._db.execute(
            select(count())
            .select_from(backlog_stories)
            .where(backlog_stories.c.backlog_id == backlog_id)
        )
        return result.scalar_one()

    async def get_task_count(self, backlog_id: str) -> int:
        result = await self._db.execute(
            select(count())
            .select_from(backlog_tasks)
            .where(backlog_tasks.c.backlog_id == backlog_id)
        )
        return result.scalar_one()

    async def get_story_project_id(self, story_id: str) -> tuple[bool, str | None]:
        q = select(stories_t.c.project_id).where(stories_t.c.id == story_id)
        row = (await self._db.execute(q)).mappings().first()
        if not row:
            return False, None
        return True, row["project_id"]

    async def get_task_project_id(self, task_id: str) -> tuple[bool, str | None]:
        row = (
            (await self._db.execute(select(tasks_t.c.project_id).where(tasks_t.c.id == task_id)))
            .mappings()
            .first()
        )
        if not row:
            return False, None
        return True, row["project_id"]

    async def story_backlog_id(self, story_id: str) -> str | None:
        row = (
            (
                await self._db.execute(
                    select(backlog_stories.c.backlog_id).where(
                        backlog_stories.c.story_id == story_id
                    )
                )
            )
            .mappings()
            .first()
        )
        return row["backlog_id"] if row else None

    async def get_story_backlog_item(self, story_id: str) -> tuple[str | None, int | None]:
        row = (
            (
                await self._db.execute(
                    select(backlog_stories.c.backlog_id, backlog_stories.c.position).where(
                        backlog_stories.c.story_id == story_id
                    )
                )
            )
            .mappings()
            .first()
        )
        if not row:
            return None, None
        return row["backlog_id"], row["position"]

    async def task_backlog_id(self, task_id: str) -> str | None:
        row = (
            (
                await self._db.execute(
                    select(backlog_tasks.c.backlog_id).where(backlog_tasks.c.task_id == task_id)
                )
            )
            .mappings()
            .first()
        )
        return row["backlog_id"] if row else None

    async def add_story_item(
        self, backlog_id: str, story_id: str, position: int | None
    ) -> BacklogStoryItem:
        return await _add_story_item(self._db, backlog_id, story_id, position)

    async def remove_story_item(self, backlog_id: str, story_id: str) -> bool:
        return await _remove_story_item(self._db, backlog_id, story_id)

    async def move_story_item(
        self,
        *,
        source_backlog_id: str,
        target_backlog_id: str,
        story_id: str,
        target_position: int | None,
    ) -> BacklogStoryItem:
        return await _move_story_item(
            self._db,
            source_backlog_id=source_backlog_id,
            target_backlog_id=target_backlog_id,
            story_id=story_id,
            target_position=target_position,
        )

    async def add_task_item(self, backlog_id: str, task_id: str, position: int) -> BacklogTaskItem:
        return await _add_task_item(self._db, backlog_id, task_id, position)

    async def remove_task_item(self, backlog_id: str, task_id: str) -> bool:
        return await _remove_task_item(self._db, backlog_id, task_id)

    async def reorder_items(
        self,
        backlog_id: str,
        stories: list[dict[str, Any]],
        tasks: list[dict[str, Any]],
    ) -> dict[str, int]:
        return await _reorder_items(self._db, backlog_id, stories, tasks)

    async def list_backlog_stories(self, backlog_id: str) -> list[dict[str, Any]]:
        return await get_backlog_story_rows(self._db, backlog_id)

    async def list_task_items(self, backlog_id: str) -> list[BacklogTaskItem]:
        return await _list_task_items(self._db, backlog_id)

    async def get_active_sprint_with_stories(
        self, project_id: str
    ) -> tuple[Backlog | None, list[dict[str, Any]]]:
        backlog = await self.get_active_sprint_backlog(project_id)
        if not backlog:
            return None, []
        return backlog, await get_backlog_story_rows(self._db, backlog.id)

    async def get_active_sprint_backlog(self, project_id: str) -> Backlog | None:
        row = (
            (
                await self._db.execute(
                    select(backlogs)
                    .where(
                        (backlogs.c.project_id == project_id)
                        & (backlogs.c.kind == "SPRINT")
                        & (backlogs.c.status == "ACTIVE")
                    )
                    .order_by(
                        backlogs.c.display_order.asc(),
                        backlogs.c.created_at.asc(),
                        backlogs.c.id.asc(),
                    )
                    .limit(1)
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
                    select(backlogs)
                    .where(
                        (backlogs.c.project_id == project_id)
                        & (backlogs.c.kind == "BACKLOG")
                        & (backlogs.c.status == "ACTIVE")
                    )
                    .order_by(
                        backlogs.c.is_default.desc(),
                        backlogs.c.display_order.asc(),
                        backlogs.c.created_at.asc(),
                        backlogs.c.id.asc(),
                    )
                    .limit(1)
                )
            )
            .mappings()
            .first()
        )
        return _row_to_backlog(row) if row else None
