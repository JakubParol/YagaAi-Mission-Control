from dataclasses import asdict

from fastapi import APIRouter, Depends

from app.shared.api.errors import NotFoundError
from app.workflow.application.workflow_service import WorkflowService
from app.workflow.dependencies import get_workflow_service
from app.workflow.domain.models import WorkflowTask

router = APIRouter(tags=["workflow"])


def _task_to_dict(task: WorkflowTask) -> dict:
    """Serialize WorkflowTask with camelCase keys matching the frontend."""
    d = asdict(task)
    d["parseError"] = d.pop("parse_error")
    return d


@router.get("/agents")
async def get_agents(
    service: WorkflowService = Depends(get_workflow_service),
) -> list[dict]:
    statuses = await service.get_agent_statuses()
    result = []
    for s in statuses:
        item: dict = {"name": s.name, "role": s.role, "status": s.status}
        if s.task:
            item["task"] = s.task
        result.append(item)
    return result


@router.get("/stories")
async def list_stories(
    service: WorkflowService = Depends(get_workflow_service),
) -> list[dict]:
    stories = await service.list_stories()
    return [asdict(s) for s in stories]


@router.get("/stories/{story_id}")
async def get_story(
    story_id: str,
    service: WorkflowService = Depends(get_workflow_service),
) -> dict:
    story, tasks = await service.get_story(story_id)
    if not story:
        raise NotFoundError("Story not found")
    return {"story": asdict(story), "tasks": [_task_to_dict(t) for t in tasks]}


@router.get("/board")
async def get_board(
    service: WorkflowService = Depends(get_workflow_service),
) -> dict:
    stories, tasks = await service.get_board()
    return {
        "stories": [asdict(s) for s in stories],
        "tasks": [_task_to_dict(t) for t in tasks],
    }


@router.get("/tasks/{story_id}/{task_id}")
async def get_task(
    story_id: str,
    task_id: str,
    service: WorkflowService = Depends(get_workflow_service),
) -> dict:
    task, results = await service.get_task(story_id, task_id)
    if not task:
        raise NotFoundError("Task not found")
    return {
        "task": _task_to_dict(task),
        "results": asdict(results) if results else None,
    }
