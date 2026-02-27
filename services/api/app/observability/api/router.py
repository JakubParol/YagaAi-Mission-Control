from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from app.observability.application.dashboard_service import DashboardService
from app.observability.application.import_service import ImportService
from app.observability.application.workflow_service import WorkflowService
from app.observability.dependencies import (
    get_dashboard_service,
    get_import_service,
    get_workflow_service,
)
from app.observability.domain.models import WorkflowTask
from app.shared.api.errors import NotFoundError

router = APIRouter(tags=["observability"])


def _task_to_dict(task: WorkflowTask) -> dict:
    """Serialize WorkflowTask with camelCase keys matching the frontend."""
    d = asdict(task)
    d["parseError"] = d.pop("parse_error")
    return d


# --- Agents ---


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


# --- Costs ---


@router.get("/costs")
async def get_costs(
    service: DashboardService = Depends(get_dashboard_service),
    from_param: str | None = Query(None, alias="from"),
    to_param: str | None = Query(None, alias="to"),
    days: int | None = Query(None),
) -> dict:
    if from_param and to_param:
        from_str = from_param
        to_str = to_param
    else:
        valid_days = days if days in (1, 7, 30) else 7
        now = datetime.now(timezone.utc)
        from_date = now - timedelta(days=valid_days)
        from_str = from_date.strftime("%Y-%m-%d")
        to_str = now.strftime("%Y-%m-%d")

    return await service.get_costs(from_str, to_str)


# --- Requests ---


@router.get("/requests")
async def get_requests(
    service: DashboardService = Depends(get_dashboard_service),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    model: str | None = Query(None),
    from_param: str | None = Query(None, alias="from"),
    to_param: str | None = Query(None, alias="to"),
) -> dict:
    return await service.get_requests(page, limit, model, from_param, to_param)


@router.get("/requests/models")
async def get_request_models(
    service: DashboardService = Depends(get_dashboard_service),
) -> dict:
    models = await service.get_distinct_models()
    return {"models": models}


# --- Imports ---


@router.post("/imports")
async def trigger_import(
    service: ImportService = Depends(get_import_service),
) -> dict:
    return await service.run_import()


@router.get("/imports/status")
async def get_import_status(
    service: DashboardService = Depends(get_dashboard_service),
) -> dict:
    return await service.get_import_status()


# --- Workflow: Stories, Board, Tasks ---


@router.get("/workflow/stories")
async def list_stories(
    service: WorkflowService = Depends(get_workflow_service),
) -> list[dict]:
    stories = await service.list_stories()
    return [asdict(s) for s in stories]


@router.get("/workflow/stories/{story_id}")
async def get_story(
    story_id: str,
    service: WorkflowService = Depends(get_workflow_service),
) -> dict:
    story, tasks = await service.get_story(story_id)
    if not story:
        raise NotFoundError("Story not found")
    return {"story": asdict(story), "tasks": [_task_to_dict(t) for t in tasks]}


@router.get("/workflow/board")
async def get_board(
    service: WorkflowService = Depends(get_workflow_service),
) -> dict:
    stories, tasks = await service.get_board()
    return {
        "stories": [asdict(s) for s in stories],
        "tasks": [_task_to_dict(t) for t in tasks],
    }


@router.get("/workflow/tasks/{story_id}/{task_id}")
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
