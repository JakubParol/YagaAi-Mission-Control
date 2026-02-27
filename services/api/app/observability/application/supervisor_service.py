from app.observability.application.ports import SupervisorAdapterPort
from app.observability.domain.models import (
    AgentStatus,
    SupervisorStory,
    SupervisorTask,
    TaskResult,
)


class SupervisorService:
    def __init__(self, adapter: SupervisorAdapterPort) -> None:
        self._adapter = adapter

    async def list_stories(self) -> list[SupervisorStory]:
        return await self._adapter.list_stories()

    async def get_story(self, story_id: str) -> tuple[SupervisorStory | None, list[SupervisorTask]]:
        story = await self._adapter.get_story(story_id)
        if not story:
            return None, []
        tasks = await self._adapter.list_tasks_for_story(story_id)
        return story, tasks

    async def get_board(self) -> tuple[list[SupervisorStory], list[SupervisorTask]]:
        stories = await self._adapter.list_stories()
        all_tasks: list[SupervisorTask] = []
        for story in stories:
            tasks = await self._adapter.list_tasks_for_story(story.id)
            all_tasks.extend(tasks)
        return stories, all_tasks

    async def get_task(
        self, story_id: str, task_id: str
    ) -> tuple[SupervisorTask | None, TaskResult | None]:
        task = await self._adapter.get_task(story_id, task_id)
        if not task:
            return None, None
        results = await self._adapter.get_task_results(story_id, task_id)
        return task, results

    async def get_agent_statuses(self) -> list[AgentStatus]:
        return await self._adapter.get_agent_statuses()
