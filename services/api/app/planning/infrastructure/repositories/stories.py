from typing import Any
from typing import cast as type_cast

from sqlalchemy import delete, insert, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.functions import count

from app.planning.application.ports import StoryRepository
from app.planning.domain.models import Story
from app.planning.infrastructure.shared.events import insert_assignment_event
from app.planning.infrastructure.shared.mappers import _row_to_story
from app.planning.infrastructure.shared.sorting import parse_sort
from app.planning.infrastructure.tables import (
    agents,
    epics,
    labels,
    project_counters,
    projects,
    stories,
    story_labels,
)
from app.shared.api.errors import ValidationError
from app.shared.utils import utc_now

_SORT_ALLOWED_STORY = {
    "created_at": stories.c.created_at,
    "updated_at": stories.c.updated_at,
    "title": stories.c.title,
    "priority": stories.c.priority,
    "status": stories.c.status,
}


class DbStoryRepository(StoryRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_all(
        self,
        *,
        key: str | None = None,
        project_id: str | None = None,
        epic_id: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Story], int]:
        conditions = []
        if key:
            conditions.append(stories.c.key == key)
        if project_id:
            conditions.append(stories.c.project_id == project_id)
        if epic_id:
            conditions.append(stories.c.epic_id == epic_id)
        if status:
            conditions.append(stories.c.status == status)

        order = parse_sort(sort, _SORT_ALLOWED_STORY)
        if not order:
            order = [stories.c.created_at.desc()]

        count_q = select(count()).select_from(stories)
        select_q = select(stories)
        for cond in conditions:
            count_q = count_q.where(cond)
            select_q = select_q.where(cond)
        select_q = select_q.order_by(*order).limit(limit).offset(offset)

        total = (await self._db.execute(count_q)).scalar_one()
        rows = (await self._db.execute(select_q)).mappings().all()
        return [_row_to_story(r) for r in rows], total

    async def get_by_id(self, story_id: str) -> Story | None:
        row = (
            (await self._db.execute(select(stories).where(stories.c.id == story_id)))
            .mappings()
            .first()
        )
        return _row_to_story(row) if row else None

    async def get_by_key(self, key: str) -> Story | None:
        row = (
            (await self._db.execute(select(stories).where(stories.c.key == key.upper())))
            .mappings()
            .first()
        )
        return _row_to_story(row) if row else None

    async def create(self, story: Story) -> Story:
        await self._db.execute(
            insert(stories).values(
                id=story.id,
                project_id=story.project_id,
                epic_id=story.epic_id,
                key=story.key,
                title=story.title,
                intent=story.intent,
                description=story.description,
                story_type=story.story_type,
                status=story.status,
                is_blocked=1 if story.is_blocked else 0,
                blocked_reason=story.blocked_reason,
                priority=story.priority,
                current_assignee_agent_id=story.current_assignee_agent_id,
                metadata_json=story.metadata_json,
                created_by=story.created_by,
                updated_by=story.updated_by,
                created_at=story.created_at,
                updated_at=story.updated_at,
                started_at=story.started_at,
                completed_at=story.completed_at,
            )
        )
        await self._db.commit()
        return story

    async def update(self, story_id: str, data: dict[str, Any]) -> Story | None:
        allowed = {
            "title",
            "intent",
            "description",
            "story_type",
            "status",
            "epic_id",
            "is_blocked",
            "blocked_reason",
            "priority",
            "current_assignee_agent_id",
            "metadata_json",
            "updated_by",
            "updated_at",
            "started_at",
            "completed_at",
        }
        values = {k: v for k, v in data.items() if k in allowed}
        if not values:
            return await self.get_by_id(story_id)

        if "is_blocked" in values:
            values["is_blocked"] = 1 if values["is_blocked"] else 0

        await self._db.execute(update(stories).where(stories.c.id == story_id).values(**values))
        await self._db.commit()
        return await self.get_by_id(story_id)

    async def update_assignee_with_event(
        self,
        *,
        story_id: str,
        data: dict[str, Any],
        new_assignee_agent_id: str | None,
        previous_assignee_agent_id: str | None,
        actor_id: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> Story | None:
        allowed = {
            "title",
            "intent",
            "description",
            "story_type",
            "status",
            "epic_id",
            "is_blocked",
            "blocked_reason",
            "priority",
            "current_assignee_agent_id",
            "metadata_json",
            "updated_by",
            "updated_at",
            "started_at",
            "completed_at",
        }
        values = {k: v for k, v in data.items() if k in allowed}
        if not values:
            return await self.get_by_id(story_id)

        if "is_blocked" in values:
            values["is_blocked"] = 1 if values["is_blocked"] else 0

        row = (
            (await self._db.execute(select(stories.c.key).where(stories.c.id == story_id)))
            .mappings()
            .first()
        )
        if row is None:
            return None

        try:
            await self._db.execute(update(stories).where(stories.c.id == story_id).values(**values))
            await insert_assignment_event(
                self._db,
                actor_id=actor_id,
                entity_type="story",
                entity_id=story_id,
                work_item_key=row["key"],
                new_assignee_agent_id=new_assignee_agent_id,
                previous_assignee_agent_id=previous_assignee_agent_id,
                occurred_at=occurred_at,
                correlation_id=correlation_id,
                causation_id=causation_id,
            )
            await self._db.commit()
        except Exception:
            await self._db.rollback()
            raise
        return await self.get_by_id(story_id)

    async def delete(self, story_id: str) -> bool:
        result = type_cast(
            CursorResult, await self._db.execute(delete(stories).where(stories.c.id == story_id))
        )
        await self._db.commit()
        return (result.rowcount or 0) > 0

    async def get_task_count(self, story_id: str) -> int:
        from app.planning.infrastructure.tables import tasks

        result = await self._db.execute(
            select(count()).select_from(tasks).where(tasks.c.story_id == story_id)
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

    async def epic_exists(self, epic_id: str) -> bool:
        row = (await self._db.execute(select(epics.c.id).where(epics.c.id == epic_id))).first()
        return row is not None

    async def label_exists(self, label_id: str) -> bool:
        row = (await self._db.execute(select(labels.c.id).where(labels.c.id == label_id))).first()
        return row is not None

    async def attach_label(self, story_id: str, label_id: str) -> None:
        await self._db.execute(
            insert(story_labels).values(story_id=story_id, label_id=label_id, added_at=utc_now())
        )
        await self._db.commit()

    async def detach_label(self, story_id: str, label_id: str) -> bool:
        result = type_cast(
            CursorResult,
            await self._db.execute(
                delete(story_labels).where(
                    (story_labels.c.story_id == story_id) & (story_labels.c.label_id == label_id)
                )
            ),
        )
        await self._db.commit()
        return (result.rowcount or 0) > 0

    async def label_attached(self, story_id: str, label_id: str) -> bool:
        row = (
            await self._db.execute(
                select(story_labels.c.story_id).where(
                    (story_labels.c.story_id == story_id) & (story_labels.c.label_id == label_id)
                )
            )
        ).first()
        return row is not None

    async def agent_exists(self, agent_id: str) -> bool:
        row = (await self._db.execute(select(agents.c.id).where(agents.c.id == agent_id))).first()
        return row is not None
