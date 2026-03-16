from typing import Any

from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.functions import count

from app.planning.domain.models import BacklogStoryItem, BacklogTaskItem
from app.planning.infrastructure.tables import backlog_stories, backlog_tasks
from app.planning.infrastructure.tables import tasks as tasks_t
from app.shared.utils import utc_now


async def add_story_item(
    db: AsyncSession, backlog_id: str, story_id: str, position: int | None
) -> BacklogStoryItem:
    if position is None:
        rows = (
            (
                await db.execute(
                    select(backlog_stories.c.position)
                    .where(backlog_stories.c.backlog_id == backlog_id)
                    .order_by(backlog_stories.c.position.asc())
                )
            )
            .mappings()
            .all()
        )
        normalized = 0
        for row in rows:
            if row["position"] == normalized:
                normalized += 1
            elif row["position"] > normalized:
                break
    else:
        item_count = (
            await db.execute(
                select(count())
                .select_from(backlog_stories)
                .where(backlog_stories.c.backlog_id == backlog_id)
            )
        ).scalar_one()
        normalized = min(position, item_count)

    await db.execute(
        update(backlog_stories)
        .where(
            (backlog_stories.c.backlog_id == backlog_id)
            & (backlog_stories.c.position >= normalized)
        )
        .values(position=backlog_stories.c.position + 1)
    )
    added_at = utc_now()
    await db.execute(
        insert(backlog_stories).values(
            backlog_id=backlog_id,
            story_id=story_id,
            position=normalized,
            added_at=added_at,
        )
    )
    await db.commit()
    return BacklogStoryItem(
        backlog_id=backlog_id,
        story_id=story_id,
        position=normalized,
        added_at=added_at,
    )


async def remove_story_item(db: AsyncSession, backlog_id: str, story_id: str) -> bool:
    row = (
        (
            await db.execute(
                select(backlog_stories.c.position).where(
                    (backlog_stories.c.backlog_id == backlog_id)
                    & (backlog_stories.c.story_id == story_id)
                )
            )
        )
        .mappings()
        .first()
    )
    if not row:
        return False
    removed_position = row["position"]
    await db.execute(
        delete(backlog_stories).where(
            (backlog_stories.c.backlog_id == backlog_id) & (backlog_stories.c.story_id == story_id)
        )
    )
    await db.execute(
        update(backlog_stories)
        .where(
            (backlog_stories.c.backlog_id == backlog_id)
            & (backlog_stories.c.position > removed_position)
        )
        .values(position=backlog_stories.c.position - 1)
    )
    await db.commit()
    return True


async def move_story_item(
    db: AsyncSession,
    *,
    source_backlog_id: str,
    target_backlog_id: str,
    story_id: str,
    target_position: int | None,
) -> BacklogStoryItem:
    row = (
        (
            await db.execute(
                select(backlog_stories.c.position).where(
                    (backlog_stories.c.backlog_id == source_backlog_id)
                    & (backlog_stories.c.story_id == story_id)
                )
            )
        )
        .mappings()
        .first()
    )
    if not row:
        raise ValueError(f"Story {story_id} is not in backlog {source_backlog_id}")

    source_position = row["position"]
    await db.execute(
        delete(backlog_stories).where(
            (backlog_stories.c.backlog_id == source_backlog_id)
            & (backlog_stories.c.story_id == story_id)
        )
    )
    await db.execute(
        update(backlog_stories)
        .where(
            (backlog_stories.c.backlog_id == source_backlog_id)
            & (backlog_stories.c.position > source_position)
        )
        .values(position=backlog_stories.c.position - 1)
    )

    if target_position is None:
        rows = (
            (
                await db.execute(
                    select(backlog_stories.c.position)
                    .where(backlog_stories.c.backlog_id == target_backlog_id)
                    .order_by(backlog_stories.c.position.asc())
                )
            )
            .mappings()
            .all()
        )
        normalized = 0
        for target_row in rows:
            if target_row["position"] == normalized:
                normalized += 1
            elif target_row["position"] > normalized:
                break
    else:
        item_count = (
            await db.execute(
                select(count())
                .select_from(backlog_stories)
                .where(backlog_stories.c.backlog_id == target_backlog_id)
            )
        ).scalar_one()
        normalized = min(target_position, item_count)

    await db.execute(
        update(backlog_stories)
        .where(
            (backlog_stories.c.backlog_id == target_backlog_id)
            & (backlog_stories.c.position >= normalized)
        )
        .values(position=backlog_stories.c.position + 1)
    )
    added_at = utc_now()
    await db.execute(
        insert(backlog_stories).values(
            backlog_id=target_backlog_id,
            story_id=story_id,
            position=normalized,
            added_at=added_at,
        )
    )
    await db.commit()
    return BacklogStoryItem(
        backlog_id=target_backlog_id,
        story_id=story_id,
        position=normalized,
        added_at=added_at,
    )


async def add_task_item(
    db: AsyncSession, backlog_id: str, task_id: str, position: int
) -> BacklogTaskItem:
    item_count = (
        await db.execute(
            select(count())
            .select_from(backlog_tasks)
            .where(backlog_tasks.c.backlog_id == backlog_id)
        )
    ).scalar_one()
    normalized = min(position, item_count)
    await db.execute(
        update(backlog_tasks)
        .where(
            (backlog_tasks.c.backlog_id == backlog_id) & (backlog_tasks.c.position >= normalized)
        )
        .values(position=backlog_tasks.c.position + 1)
    )
    added_at = utc_now()
    await db.execute(
        insert(backlog_tasks).values(
            backlog_id=backlog_id,
            task_id=task_id,
            position=normalized,
            added_at=added_at,
        )
    )
    await db.commit()
    return BacklogTaskItem(
        backlog_id=backlog_id,
        task_id=task_id,
        position=normalized,
        added_at=added_at,
    )


async def remove_task_item(db: AsyncSession, backlog_id: str, task_id: str) -> bool:
    row = (
        (
            await db.execute(
                select(backlog_tasks.c.position).where(
                    (backlog_tasks.c.backlog_id == backlog_id)
                    & (backlog_tasks.c.task_id == task_id)
                )
            )
        )
        .mappings()
        .first()
    )
    if not row:
        return False
    removed_position = row["position"]
    await db.execute(
        delete(backlog_tasks).where(
            (backlog_tasks.c.backlog_id == backlog_id) & (backlog_tasks.c.task_id == task_id)
        )
    )
    await db.execute(
        update(backlog_tasks)
        .where(
            (backlog_tasks.c.backlog_id == backlog_id)
            & (backlog_tasks.c.position > removed_position)
        )
        .values(position=backlog_tasks.c.position - 1)
    )
    await db.commit()
    return True


async def reorder_items(
    db: AsyncSession,
    backlog_id: str,
    stories: list[dict[str, Any]],
    tasks: list[dict[str, Any]],
) -> dict[str, int]:
    for row in stories:
        await db.execute(
            update(backlog_stories)
            .where(
                (backlog_stories.c.backlog_id == backlog_id)
                & (backlog_stories.c.story_id == row["story_id"])
            )
            .values(position=row["position"])
        )
    for row in tasks:
        await db.execute(
            update(backlog_tasks)
            .where(
                (backlog_tasks.c.backlog_id == backlog_id)
                & (backlog_tasks.c.task_id == row["task_id"])
            )
            .values(position=row["position"])
        )
    await db.commit()
    return {
        "updated_story_count": len(stories),
        "updated_task_count": len(tasks),
    }


async def list_task_items(db: AsyncSession, backlog_id: str) -> list[BacklogTaskItem]:
    bt = backlog_tasks
    t = tasks_t
    rows = (
        (
            await db.execute(
                select(bt.c.backlog_id, bt.c.task_id, bt.c.position, bt.c.added_at)
                .select_from(bt.join(t, t.c.id == bt.c.task_id))
                .where((bt.c.backlog_id == backlog_id) & t.c.story_id.is_(None))
                .order_by(bt.c.position.asc())
            )
        )
        .mappings()
        .all()
    )
    return [
        BacklogTaskItem(
            backlog_id=row["backlog_id"],
            task_id=row["task_id"],
            position=row["position"],
            added_at=row["added_at"],
        )
        for row in rows
    ]
