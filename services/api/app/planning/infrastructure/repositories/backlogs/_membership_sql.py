from typing import Any

from app.planning.domain.models import BacklogStoryItem, BacklogTaskItem
from app.planning.infrastructure.shared.sql import (
    DbConnection,
    _fetch_all,
    _fetch_count,
    _fetch_one,
)
from app.shared.utils import utc_now


async def add_story_item(
    db: DbConnection, backlog_id: str, story_id: str, position: int | None
) -> BacklogStoryItem:
    if position is None:
        rows = await _fetch_all(
            db,
            "SELECT position FROM backlog_stories WHERE backlog_id = ? ORDER BY position ASC",
            [backlog_id],
        )
        normalized = 0
        for row in rows:
            if row["position"] == normalized:
                normalized += 1
            elif row["position"] > normalized:
                break
    else:
        max_position = await _fetch_count(
            db,
            "SELECT COUNT(*) FROM backlog_stories WHERE backlog_id = ?",
            [backlog_id],
        )
        normalized = min(position, max_position)
    await db.execute(
        """UPDATE backlog_stories
           SET position = position + 1
           WHERE backlog_id = ? AND position >= ?""",
        [backlog_id, normalized],
    )
    added_at = utc_now()
    await db.execute(
        """INSERT INTO backlog_stories (backlog_id, story_id, position, added_at)
           VALUES (?, ?, ?, ?)""",
        [backlog_id, story_id, normalized, added_at],
    )
    await db.commit()
    return BacklogStoryItem(
        backlog_id=backlog_id,
        story_id=story_id,
        position=normalized,
        added_at=added_at,
    )


async def remove_story_item(db: DbConnection, backlog_id: str, story_id: str) -> bool:
    row = await _fetch_one(
        db,
        "SELECT position FROM backlog_stories WHERE backlog_id = ? AND story_id = ?",
        [backlog_id, story_id],
    )
    if not row:
        return False
    removed_position = row["position"]
    await db.execute(
        "DELETE FROM backlog_stories WHERE backlog_id = ? AND story_id = ?",
        [backlog_id, story_id],
    )
    await db.execute(
        """UPDATE backlog_stories
           SET position = position - 1
           WHERE backlog_id = ? AND position > ?""",
        [backlog_id, removed_position],
    )
    await db.commit()
    return True


async def move_story_item(
    db: DbConnection,
    *,
    source_backlog_id: str,
    target_backlog_id: str,
    story_id: str,
    target_position: int | None,
) -> BacklogStoryItem:
    row = await _fetch_one(
        db,
        "SELECT position FROM backlog_stories WHERE backlog_id = ? AND story_id = ?",
        [source_backlog_id, story_id],
    )
    if not row:
        raise ValueError(f"Story {story_id} is not in backlog {source_backlog_id}")

    source_position = row["position"]
    await db.execute(
        "DELETE FROM backlog_stories WHERE backlog_id = ? AND story_id = ?",
        [source_backlog_id, story_id],
    )
    await db.execute(
        """UPDATE backlog_stories
           SET position = position - 1
           WHERE backlog_id = ? AND position > ?""",
        [source_backlog_id, source_position],
    )

    if target_position is None:
        rows = await _fetch_all(
            db,
            "SELECT position FROM backlog_stories WHERE backlog_id = ? ORDER BY position ASC",
            [target_backlog_id],
        )
        normalized = 0
        for target_row in rows:
            if target_row["position"] == normalized:
                normalized += 1
            elif target_row["position"] > normalized:
                break
    else:
        max_position = await _fetch_count(
            db,
            "SELECT COUNT(*) FROM backlog_stories WHERE backlog_id = ?",
            [target_backlog_id],
        )
        normalized = min(target_position, max_position)

    await db.execute(
        """UPDATE backlog_stories
           SET position = position + 1
           WHERE backlog_id = ? AND position >= ?""",
        [target_backlog_id, normalized],
    )
    added_at = utc_now()
    await db.execute(
        """INSERT INTO backlog_stories (backlog_id, story_id, position, added_at)
           VALUES (?, ?, ?, ?)""",
        [target_backlog_id, story_id, normalized, added_at],
    )
    await db.commit()
    return BacklogStoryItem(
        backlog_id=target_backlog_id,
        story_id=story_id,
        position=normalized,
        added_at=added_at,
    )


async def add_task_item(
    db: DbConnection, backlog_id: str, task_id: str, position: int
) -> BacklogTaskItem:
    max_position = await _fetch_count(
        db,
        "SELECT COUNT(*) FROM backlog_tasks WHERE backlog_id = ?",
        [backlog_id],
    )
    normalized = min(position, max_position)
    await db.execute(
        """UPDATE backlog_tasks
           SET position = position + 1
           WHERE backlog_id = ? AND position >= ?""",
        [backlog_id, normalized],
    )
    added_at = utc_now()
    await db.execute(
        """INSERT INTO backlog_tasks (backlog_id, task_id, position, added_at)
           VALUES (?, ?, ?, ?)""",
        [backlog_id, task_id, normalized, added_at],
    )
    await db.commit()
    return BacklogTaskItem(
        backlog_id=backlog_id,
        task_id=task_id,
        position=normalized,
        added_at=added_at,
    )


async def remove_task_item(db: DbConnection, backlog_id: str, task_id: str) -> bool:
    row = await _fetch_one(
        db,
        "SELECT position FROM backlog_tasks WHERE backlog_id = ? AND task_id = ?",
        [backlog_id, task_id],
    )
    if not row:
        return False
    removed_position = row["position"]
    await db.execute(
        "DELETE FROM backlog_tasks WHERE backlog_id = ? AND task_id = ?",
        [backlog_id, task_id],
    )
    await db.execute(
        """UPDATE backlog_tasks
           SET position = position - 1
           WHERE backlog_id = ? AND position > ?""",
        [backlog_id, removed_position],
    )
    await db.commit()
    return True


async def reorder_items(
    db: DbConnection,
    backlog_id: str,
    stories: list[dict[str, Any]],
    tasks: list[dict[str, Any]],
) -> dict[str, int]:
    for row in stories:
        await db.execute(
            """UPDATE backlog_stories
               SET position = ?
               WHERE backlog_id = ? AND story_id = ?""",
            [row["position"], backlog_id, row["story_id"]],
        )
    for row in tasks:
        await db.execute(
            """UPDATE backlog_tasks
               SET position = ?
               WHERE backlog_id = ? AND task_id = ?""",
            [row["position"], backlog_id, row["task_id"]],
        )
    await db.commit()
    return {
        "updated_story_count": len(stories),
        "updated_task_count": len(tasks),
    }


async def list_task_items(db: DbConnection, backlog_id: str) -> list[BacklogTaskItem]:
    rows = await _fetch_all(
        db,
        """SELECT bt.backlog_id, bt.task_id, bt.position, bt.added_at
           FROM backlog_tasks bt
           JOIN tasks t ON t.id = bt.task_id
           WHERE bt.backlog_id = ? AND t.story_id IS NULL
           ORDER BY bt.position ASC""",
        [backlog_id],
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
