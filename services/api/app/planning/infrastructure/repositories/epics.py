from typing import Any
from typing import cast as type_cast

from sqlalchemy import (
    TIMESTAMP,
    ColumnElement,
    Integer,
    Interval,
    Numeric,
    case,
    cast,
    delete,
    extract,
    func,
    insert,
    literal_column,
    select,
    update,
)
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.functions import coalesce, count, current_timestamp
from sqlalchemy.sql.functions import sum as sa_sum

from app.planning.application.ports import EpicRepository
from app.planning.domain.models import Epic, EpicOverview
from app.planning.infrastructure.shared.mappers import _row_to_epic, _row_to_epic_overview
from app.planning.infrastructure.shared.sorting import parse_sort
from app.planning.infrastructure.tables import (
    epics,
    labels,
    project_counters,
    projects,
    stories,
    story_labels,
)
from app.shared.api.errors import ValidationError
from app.shared.utils import utc_now

_SORT_ALLOWED_EPIC: dict[str, ColumnElement[Any]] = {
    "created_at": epics.c.created_at,
    "updated_at": epics.c.updated_at,
    "title": epics.c.title,
    "priority": epics.c.priority,
    "status": epics.c.status,
}

_SORT_ALLOWED_EPIC_OVERVIEW: dict[str, ColumnElement[Any]] = {
    "priority": literal_column("priority"),
    "progress_pct": literal_column("progress_pct"),
    "progress_trend_7d": literal_column("progress_trend_7d"),
    "updated_at": literal_column("updated_at"),
    "blocked_count": literal_column("blocked_count"),
}


class DbEpicRepository(EpicRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_all(
        self,
        *,
        key: str | None = None,
        project_id: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Epic], int]:
        conditions = []
        if key:
            conditions.append(epics.c.key == key)
        if project_id:
            conditions.append(epics.c.project_id == project_id)
        if status:
            conditions.append(epics.c.status == status)

        order = parse_sort(sort, _SORT_ALLOWED_EPIC)
        if not order:
            order = [epics.c.created_at.desc()]

        count_q = select(count()).select_from(epics)
        select_q = select(epics)
        for cond in conditions:
            count_q = count_q.where(cond)
            select_q = select_q.where(cond)
        select_q = select_q.order_by(*order).limit(limit).offset(offset)

        total = (await self._db.execute(count_q)).scalar_one()
        rows = (await self._db.execute(select_q)).mappings().all()
        return [_row_to_epic(r) for r in rows], total

    async def list_overview(
        self,
        *,
        project_id: str | None = None,
        status: str | None = None,
        owner: str | None = None,
        is_blocked: bool | None = None,
        label: str | None = None,
        text: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-updated_at",
    ) -> tuple[list[EpicOverview], int]:
        story_stats = (
            select(
                stories.c.epic_id.label("epic_id"),
                count().label("stories_total"),
                sa_sum(case((stories.c.status == "DONE", 1), else_=0)).label("stories_done"),
                sa_sum(
                    case(
                        (
                            (stories.c.status == "DONE")
                            & stories.c.completed_at.isnot(None)
                            & (
                                cast(stories.c.completed_at, TIMESTAMP(timezone=True))
                                >= current_timestamp()
                                - cast(literal_column("'7 days'"), Interval())
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ).label("stories_done_last_7d"),
                sa_sum(case((stories.c.status == "IN_PROGRESS", 1), else_=0)).label(
                    "stories_in_progress"
                ),
                sa_sum(case((stories.c.is_blocked == 1, 1), else_=0)).label("blocked_count"),
            )
            .where(stories.c.epic_id.isnot(None))
            .group_by(stories.c.epic_id)
            .subquery("ss")
        )

        progress_pct = case(
            (coalesce(story_stats.c.stories_total, 0) == 0, 0.0),
            else_=func.round(
                cast(
                    coalesce(story_stats.c.stories_done, 0) * 100.0 / story_stats.c.stories_total,
                    Numeric,
                ),
                2,
            ),
        ).label("progress_pct")

        progress_trend_7d = case(
            (coalesce(story_stats.c.stories_total, 0) == 0, 0.0),
            else_=func.round(
                cast(
                    coalesce(story_stats.c.stories_done_last_7d, 0)
                    * 100.0
                    / story_stats.c.stories_total,
                    Numeric,
                ),
                2,
            ),
        ).label("progress_trend_7d")

        stale_days = func.greatest(
            0,
            cast(
                extract(
                    "epoch",
                    current_timestamp() - cast(epics.c.updated_at, TIMESTAMP(timezone=True)),
                )
                / 86400.0,
                Integer(),
            ),
        ).label("stale_days")

        base_q = select(
            epics.c.key.label("epic_key"),
            epics.c.title.label("title"),
            epics.c.status.label("status"),
            progress_pct,
            progress_trend_7d,
            coalesce(story_stats.c.stories_total, 0).label("stories_total"),
            coalesce(story_stats.c.stories_done, 0).label("stories_done"),
            coalesce(story_stats.c.stories_in_progress, 0).label("stories_in_progress"),
            coalesce(story_stats.c.blocked_count, 0).label("blocked_count"),
            stale_days,
            epics.c.priority.label("priority"),
            epics.c.updated_at.label("updated_at"),
        ).select_from(epics.outerjoin(story_stats, story_stats.c.epic_id == epics.c.id))

        conditions = []
        if project_id:
            conditions.append(epics.c.project_id == project_id)
        if status:
            conditions.append(epics.c.status == status)
        if owner:
            conditions.append(
                select(literal_column("1"))
                .select_from(stories)
                .where(stories.c.epic_id == epics.c.id)
                .where(stories.c.current_assignee_agent_id == owner)
                .exists()
            )
        if label:
            conditions.append(
                select(literal_column("1"))
                .select_from(
                    stories.join(story_labels, story_labels.c.story_id == stories.c.id).join(
                        labels, labels.c.id == story_labels.c.label_id
                    )
                )
                .where(stories.c.epic_id == epics.c.id)
                .where(func.lower(labels.c.name) == func.lower(label))
                .exists()
            )
        if text:
            like = "%" + text.strip() + "%"
            conditions.append(epics.c.title.ilike(like) | epics.c.key.ilike(like))
        if is_blocked is True:
            conditions.append(
                (epics.c.is_blocked == 1) | (coalesce(story_stats.c.blocked_count, 0) > 0)
            )
        if is_blocked is False:
            conditions.append(
                (epics.c.is_blocked == 0) & (coalesce(story_stats.c.blocked_count, 0) == 0)
            )

        for cond in conditions:
            base_q = base_q.where(cond)

        order = parse_sort(sort, _SORT_ALLOWED_EPIC_OVERVIEW)
        if not order:
            order = [literal_column("updated_at").desc(), literal_column("epic_key").asc()]

        count_q = select(count()).select_from(base_q.subquery())
        select_q = base_q.order_by(*order).limit(limit).offset(offset)

        total = (await self._db.execute(count_q)).scalar_one()
        rows = (await self._db.execute(select_q)).mappings().all()
        return [_row_to_epic_overview(r) for r in rows], total

    async def get_by_id(self, epic_id: str) -> Epic | None:
        row = (
            (await self._db.execute(select(epics).where(epics.c.id == epic_id))).mappings().first()
        )
        return _row_to_epic(row) if row else None

    async def get_by_key(self, key: str) -> Epic | None:
        row = (
            (await self._db.execute(select(epics).where(epics.c.key == key.upper())))
            .mappings()
            .first()
        )
        return _row_to_epic(row) if row else None

    async def create(self, epic: Epic) -> Epic:
        await self._db.execute(
            insert(epics).values(
                id=epic.id,
                project_id=epic.project_id,
                key=epic.key,
                title=epic.title,
                description=epic.description,
                status=epic.status,
                status_mode=epic.status_mode,
                status_override=epic.status_override,
                status_override_set_at=epic.status_override_set_at,
                is_blocked=1 if epic.is_blocked else 0,
                blocked_reason=epic.blocked_reason,
                priority=epic.priority,
                metadata_json=epic.metadata_json,
                created_by=epic.created_by,
                updated_by=epic.updated_by,
                created_at=epic.created_at,
                updated_at=epic.updated_at,
            )
        )
        await self._db.commit()
        return epic

    async def update(self, epic_id: str, data: dict[str, Any]) -> Epic | None:
        allowed = {
            "title",
            "description",
            "status",
            "status_mode",
            "status_override",
            "status_override_set_at",
            "is_blocked",
            "blocked_reason",
            "priority",
            "metadata_json",
            "updated_by",
            "updated_at",
        }
        values = {k: v for k, v in data.items() if k in allowed}
        if not values:
            return await self.get_by_id(epic_id)

        if "is_blocked" in values:
            values["is_blocked"] = 1 if values["is_blocked"] else 0

        await self._db.execute(update(epics).where(epics.c.id == epic_id).values(**values))
        await self._db.commit()
        return await self.get_by_id(epic_id)

    async def delete(self, epic_id: str) -> bool:
        result = type_cast(
            CursorResult, await self._db.execute(delete(epics).where(epics.c.id == epic_id))
        )
        await self._db.commit()
        return (result.rowcount or 0) > 0

    async def get_story_count(self, epic_id: str) -> int:
        result = await self._db.execute(
            select(count()).select_from(stories).where(stories.c.epic_id == epic_id)
        )
        return result.scalar_one()

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
