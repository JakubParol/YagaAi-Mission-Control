import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.functions import coalesce, count

from app.planning.infrastructure.tables import (
    agents,
    backlog_stories,
    epics,
    labels,
    stories,
    story_labels,
    tasks,
)


async def get_backlog_story_rows(db: AsyncSession, backlog_id: str) -> list[dict[str, Any]]:
    s = stories
    e = epics
    bs = backlog_stories
    t = tasks

    task_count_sub = select(count()).where(t.c.story_id == s.c.id).correlate(s).scalar_subquery()
    done_task_count_sub = (
        select(count())
        .where((t.c.story_id == s.c.id) & (t.c.status == "DONE"))
        .correlate(s)
        .scalar_subquery()
    )

    q = (
        select(
            s.c.id,
            s.c.key,
            s.c.title,
            s.c.status,
            s.c.priority,
            s.c.story_type,
            s.c.current_assignee_agent_id,
            s.c.metadata_json,
            e.c.key.label("epic_key"),
            e.c.title.label("epic_title"),
            bs.c.position,
            coalesce(task_count_sub, 0).label("task_count"),
            coalesce(done_task_count_sub, 0).label("done_task_count"),
        )
        .select_from(bs.join(s, s.c.id == bs.c.story_id).outerjoin(e, e.c.id == s.c.epic_id))
        .where(bs.c.backlog_id == backlog_id)
        .order_by(bs.c.position.asc())
    )

    rows = (await db.execute(q)).mappings().all()
    result = [dict(r) for r in rows]
    await _attach_story_labels(db, result)
    await _attach_story_assignees(db, result)
    return result


async def _attach_story_labels(db: AsyncSession, story_list: list[dict[str, Any]]) -> None:
    if not story_list:
        return

    story_ids = [story["id"] for story in story_list]
    sl = story_labels
    lb = labels
    rows = (
        (
            await db.execute(
                select(sl.c.story_id, lb.c.id.label("label_id"), lb.c.name, lb.c.color)
                .select_from(sl.join(lb, lb.c.id == sl.c.label_id))
                .where(sl.c.story_id.in_(story_ids))
                .order_by(lb.c.name.asc(), lb.c.id.asc())
            )
        )
        .mappings()
        .all()
    )

    labels_by_story: dict[str, list[dict[str, Any]]] = {sid: [] for sid in story_ids}
    for row in rows:
        labels_by_story[row["story_id"]].append(
            {"id": row["label_id"], "name": row["name"], "color": row["color"]}
        )

    for story in story_list:
        story_labels_list = labels_by_story.get(story["id"], [])
        story["labels"] = story_labels_list
        story["label_ids"] = [label["id"] for label in story_labels_list]


async def _attach_story_assignees(db: AsyncSession, story_list: list[dict[str, Any]]) -> None:
    if not story_list:
        return

    assignee_ids: set[str] = set()
    assignee_by_story_id: dict[str, str] = {}

    for story in story_list:
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
        a = agents
        rows = (
            (
                await db.execute(
                    select(a.c.id, a.c.name, a.c.last_name, a.c.initials, a.c.avatar).where(
                        a.c.id.in_(list(assignee_ids)) & (a.c.is_active == 1)
                    )
                )
            )
            .mappings()
            .all()
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

    for story in story_list:
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
