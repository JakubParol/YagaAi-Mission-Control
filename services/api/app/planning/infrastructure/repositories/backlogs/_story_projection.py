import json
from typing import Any

from app.planning.infrastructure.shared.sql import DbConnection, _fetch_all

_BACKLOG_STORY_SELECT_SQL = """
SELECT s.id, s.key, s.title, s.status, s.priority, s.story_type,
       s.current_assignee_agent_id, s.metadata_json,
       e.key AS epic_key,
       e.title AS epic_title,
       bs.position,
       COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.story_id = s.id), 0)
         AS task_count,
       COALESCE(
         (
           SELECT COUNT(*)
           FROM tasks t
           WHERE t.story_id = s.id AND t.status = 'DONE'
         ),
         0
       ) AS done_task_count
FROM backlog_stories bs
JOIN stories s ON s.id = bs.story_id
LEFT JOIN epics e ON e.id = s.epic_id
WHERE bs.backlog_id = ?
ORDER BY bs.position ASC
"""


async def get_backlog_story_rows(db: DbConnection, backlog_id: str) -> list[dict[str, Any]]:
    story_rows = await _fetch_all(db, _BACKLOG_STORY_SELECT_SQL, [backlog_id])
    stories = [dict(r) for r in story_rows]
    await _attach_story_labels(db, stories)
    await _attach_story_assignees(db, stories)
    return stories


async def _attach_story_labels(db: DbConnection, stories: list[dict[str, Any]]) -> None:
    if not stories:
        return

    story_ids = [story["id"] for story in stories]
    placeholders = ",".join("?" for _ in story_ids)
    label_rows = await _fetch_all(
        db,
        f"""
        SELECT sl.story_id, l.id AS label_id, l.name, l.color
        FROM story_labels sl
        JOIN labels l ON l.id = sl.label_id
        WHERE sl.story_id IN ({placeholders})
        ORDER BY l.name ASC, l.id ASC
        """,
        story_ids,
    )

    labels_by_story: dict[str, list[dict[str, Any]]] = {story_id: [] for story_id in story_ids}
    for row in label_rows:
        labels_by_story[row["story_id"]].append(
            {
                "id": row["label_id"],
                "name": row["name"],
                "color": row["color"],
            }
        )

    for story in stories:
        story_labels = labels_by_story.get(story["id"], [])
        story["labels"] = story_labels
        story["label_ids"] = [label["id"] for label in story_labels]


async def _attach_story_assignees(db: DbConnection, stories: list[dict[str, Any]]) -> None:
    if not stories:
        return

    assignee_ids: set[str] = set()
    assignee_by_story_id: dict[str, str] = {}

    for story in stories:
        direct_assignee = story.get("current_assignee_agent_id")
        if isinstance(direct_assignee, str) and direct_assignee.strip() != "":
            assignee_id = direct_assignee.strip()
            assignee_ids.add(assignee_id)
            assignee_by_story_id[story["id"]] = assignee_id
            continue

        metadata_raw = story.get("metadata_json")
        if not isinstance(metadata_raw, str) or metadata_raw.strip() == "":
            continue
        try:
            metadata = json.loads(metadata_raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(metadata, dict):
            continue
        quick_create_assignee = metadata.get("quick_create_assignee_agent_id")
        if not isinstance(quick_create_assignee, str):
            continue
        assignee_id = quick_create_assignee.strip()
        if assignee_id == "":
            continue
        assignee_ids.add(assignee_id)
        assignee_by_story_id[story["id"]] = assignee_id

    agents_by_id: dict[str, dict[str, Any]] = {}
    if assignee_ids:
        placeholders = ", ".join(["?"] * len(assignee_ids))
        rows = await _fetch_all(
            db,
            (
                "SELECT id, name, last_name, initials, avatar "
                "FROM agents "
                f"WHERE id IN ({placeholders}) AND is_active = 1"
            ),
            list(assignee_ids),
        )
        agents_by_id = {
            row["id"]: {
                "name": row["name"],
                "last_name": row["last_name"],
                "initials": row["initials"],
                "avatar": row["avatar"],
            }
            for row in rows
        }

    for story in stories:
        assignee_id = assignee_by_story_id.get(story["id"])
        if not assignee_id:
            story["assignee_agent_id"] = None
            story["assignee_name"] = None
            story["assignee_last_name"] = None
            story["assignee_initials"] = None
            story["assignee_avatar"] = None
            continue

        agent = agents_by_id.get(assignee_id)
        story["assignee_agent_id"] = assignee_id
        story["assignee_name"] = agent["name"] if agent else None
        story["assignee_last_name"] = agent["last_name"] if agent else None
        story["assignee_initials"] = agent["initials"] if agent else None
        story["assignee_avatar"] = agent["avatar"] if agent else None
