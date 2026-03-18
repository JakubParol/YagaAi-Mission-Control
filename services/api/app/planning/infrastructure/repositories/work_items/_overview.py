"""Work item overview / progress aggregate queries."""

from sqlalchemy import Integer, Numeric, case, func, literal, select
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.ext.asyncio import AsyncSession

from app.planning.domain.models import WorkItemOverview, WorkItemStatus, WorkItemType
from app.planning.infrastructure.shared.sorting import parse_sort
from app.planning.infrastructure.tables import work_items

# Alias for self-join (children).
_children = work_items.alias("children")

_SORT_ALLOWED_OVERVIEW = {
    "updated_at": work_items.c.updated_at,
    "priority": work_items.c.priority,
    "title": work_items.c.title,
    "status": work_items.c.status,
}


async def list_overview(
    db: AsyncSession,
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
    # Sub-queries for child aggregates.
    children_total = (
        select(func.count())
        .where(_children.c.parent_id == work_items.c.id)
        .correlate(work_items)
        .scalar_subquery()
        .label("children_total")
    )
    children_done = (
        select(func.count())
        .where(
            _children.c.parent_id == work_items.c.id,
            _children.c.status == WorkItemStatus.DONE.value,
        )
        .correlate(work_items)
        .scalar_subquery()
        .label("children_done")
    )
    children_in_progress = (
        select(func.count())
        .where(
            _children.c.parent_id == work_items.c.id,
            _children.c.status == WorkItemStatus.IN_PROGRESS.value,
        )
        .correlate(work_items)
        .scalar_subquery()
        .label("children_in_progress")
    )
    blocked_count = (
        select(func.count())
        .where(
            _children.c.parent_id == work_items.c.id,
            _children.c.is_blocked == 1,
        )
        .correlate(work_items)
        .scalar_subquery()
        .label("blocked_count")
    )
    progress_pct = case(
        (children_total == 0, literal(0.0)),
        else_=func.round(
            func.cast(children_done * 100.0 / children_total, Numeric),
            1,
        ),
    ).label("progress_pct")

    stale_days = func.coalesce(
        func.cast(
            func.extract(
                "epoch",
                func.current_timestamp()
                - func.cast(work_items.c.updated_at, TIMESTAMP(timezone=True)),
            )
            / 86400,
            Integer,
        ),
        0,
    ).label("stale_days")

    cols = [
        work_items.c.key.label("work_item_key"),
        work_items.c.title,
        work_items.c.type,
        work_items.c.status,
        progress_pct,
        literal(0.0).label("progress_trend_7d"),
        children_total,
        children_done,
        children_in_progress,
        blocked_count,
        stale_days,
        work_items.c.priority,
        work_items.c.updated_at,
    ]

    conditions = []
    if type:
        conditions.append(work_items.c.type == type)
    if project_id:
        conditions.append(work_items.c.project_id == project_id)
    if status:
        conditions.append(work_items.c.status == status)
    if assignee_id:
        conditions.append(work_items.c.current_assignee_agent_id == assignee_id)
    if is_blocked is not None:
        conditions.append(work_items.c.is_blocked == (1 if is_blocked else 0))
    if text_search:
        pattern = f"%{text_search}%"
        conditions.append(work_items.c.title.ilike(pattern) | work_items.c.key.ilike(pattern))

    count_q = select(func.count()).select_from(work_items)
    select_q = select(*cols)
    for cond in conditions:
        count_q = count_q.where(cond)
        select_q = select_q.where(cond)

    order = parse_sort(sort, _SORT_ALLOWED_OVERVIEW)
    if not order:
        order = [work_items.c.updated_at.desc()]
    select_q = select_q.order_by(*order).limit(limit).offset(offset)

    total = (await db.execute(count_q)).scalar_one()
    rows = (await db.execute(select_q)).mappings().all()

    items = [
        WorkItemOverview(
            work_item_key=r["work_item_key"] or "",
            title=r["title"],
            type=WorkItemType(r["type"]),
            status=WorkItemStatus(r["status"]),
            progress_pct=float(r["progress_pct"]),
            progress_trend_7d=float(r["progress_trend_7d"]),
            children_total=int(r["children_total"]),
            children_done=int(r["children_done"]),
            children_in_progress=int(r["children_in_progress"]),
            blocked_count=int(r["blocked_count"]),
            stale_days=int(r["stale_days"]) if r["stale_days"] else 0,
            priority=r["priority"],
            updated_at=r["updated_at"],
        )
        for r in rows
    ]
    return items, total
