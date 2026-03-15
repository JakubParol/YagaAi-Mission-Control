from typing import Any

from app.planning.application.ports import StoryRepository
from app.planning.domain.models import Story
from app.planning.infrastructure.shared.events import _insert_assignment_event
from app.planning.infrastructure.shared.keys import _allocate_next_key, _project_exists
from app.planning.infrastructure.shared.mappers import _row_to_story
from app.planning.infrastructure.shared.sql import (
    DbConnection,
    _build_list_queries,
    _build_update_query,
    _exists,
    _fetch_all,
    _fetch_count,
    _fetch_one,
    _parse_sort,
)
from app.shared.utils import utc_now

_SORT_ALLOWED_STORY = {"created_at", "updated_at", "title", "priority", "status"}


class DbStoryRepository(StoryRepository):
    def __init__(self, db: DbConnection) -> None:
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
        where_parts: list[str] = []
        params: list[Any] = []

        if key:
            where_parts.append("key = ?")
            params.append(key)
        if project_id:
            where_parts.append("project_id = ?")
            params.append(project_id)
        if epic_id:
            where_parts.append("epic_id = ?")
            params.append(epic_id)
        if status:
            where_parts.append("status = ?")
            params.append(status)

        order_sql = _parse_sort(sort, _SORT_ALLOWED_STORY)
        count_q, select_q = _build_list_queries("stories", where_parts, order_sql)

        total = await _fetch_count(self._db, count_q, params)
        rows = await _fetch_all(self._db, select_q, [*params, limit, offset])
        return [_row_to_story(r) for r in rows], total

    async def get_by_id(self, story_id: str) -> Story | None:
        row = await _fetch_one(self._db, "SELECT * FROM stories WHERE id = ?", [story_id])
        return _row_to_story(row) if row else None

    async def get_by_key(self, key: str) -> Story | None:
        row = await _fetch_one(self._db, "SELECT * FROM stories WHERE key = ?", [key.upper()])
        return _row_to_story(row) if row else None

    async def create(self, story: Story) -> Story:
        await self._db.execute(
            """INSERT INTO stories (id, project_id, epic_id, key, title, intent,
               description, story_type, status,
               is_blocked, blocked_reason, priority, current_assignee_agent_id, metadata_json,
               created_by, updated_by, created_at, updated_at,
               started_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                story.id,
                story.project_id,
                story.epic_id,
                story.key,
                story.title,
                story.intent,
                story.description,
                story.story_type,
                story.status,
                1 if story.is_blocked else 0,
                story.blocked_reason,
                story.priority,
                story.current_assignee_agent_id,
                story.metadata_json,
                story.created_by,
                story.updated_by,
                story.created_at,
                story.updated_at,
                story.started_at,
                story.completed_at,
            ],
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
        sets = []
        params: list[Any] = []
        for k, v in data.items():
            if k in allowed:
                sets.append(k + " = ?")
                if k == "is_blocked":
                    params.append(1 if v else 0)
                else:
                    params.append(v)

        if not sets:
            return await self.get_by_id(story_id)

        params.append(story_id)
        await self._db.execute(_build_update_query("stories", sets), params)
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
        sets = []
        params: list[Any] = []
        for k, v in data.items():
            if k in allowed:
                sets.append(k + " = ?")
                if k == "is_blocked":
                    params.append(1 if v else 0)
                else:
                    params.append(v)

        if not sets:
            return await self.get_by_id(story_id)

        row = await _fetch_one(self._db, "SELECT key FROM stories WHERE id = ?", [story_id])
        if row is None:
            return None

        try:
            await self._db.execute("BEGIN")
            params.append(story_id)
            await self._db.execute(_build_update_query("stories", sets), params)
            await _insert_assignment_event(
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
        cursor = await self._db.execute("DELETE FROM stories WHERE id = ?", [story_id])
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def get_task_count(self, story_id: str) -> int:
        return await _fetch_count(
            self._db,
            "SELECT COUNT(*) FROM tasks WHERE story_id = ?",
            [story_id],
        )

    async def allocate_key(self, project_id: str) -> str:
        return await _allocate_next_key(self._db, project_id)

    async def project_exists(self, project_id: str) -> bool:
        return await _project_exists(self._db, project_id)

    async def epic_exists(self, epic_id: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM epics WHERE id = ?", [epic_id])

    async def label_exists(self, label_id: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM labels WHERE id = ?", [label_id])

    async def attach_label(self, story_id: str, label_id: str) -> None:
        await self._db.execute(
            """INSERT INTO story_labels (story_id, label_id, added_at)
               VALUES (?, ?, ?)""",
            [story_id, label_id, utc_now()],
        )
        await self._db.commit()

    async def detach_label(self, story_id: str, label_id: str) -> bool:
        cursor = await self._db.execute(
            "DELETE FROM story_labels WHERE story_id = ? AND label_id = ?",
            [story_id, label_id],
        )
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def label_attached(self, story_id: str, label_id: str) -> bool:
        return await _exists(
            self._db,
            "SELECT 1 FROM story_labels WHERE story_id = ? AND label_id = ?",
            [story_id, label_id],
        )

    async def agent_exists(self, agent_id: str) -> bool:
        return await _exists(self._db, "SELECT 1 FROM agents WHERE id = ?", [agent_id])
