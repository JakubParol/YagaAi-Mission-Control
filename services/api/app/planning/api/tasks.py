from fastapi import APIRouter, Depends, Query

from app.planning.api.schemas import (
    TaskAssignAgent,
    TaskAssignmentResponse,
    TaskAttachLabel,
    TaskCreate,
    TaskDetailResponse,
    TaskResponse,
    TaskUpdate,
)
from app.planning.application.task_service import TaskService
from app.planning.dependencies import get_task_service, resolve_project_key
from app.shared.api.envelope import Envelope, ListEnvelope, ListMeta

router = APIRouter(prefix="/tasks", tags=["planning/tasks"])


@router.post("", status_code=201)
async def create_task(
    body: TaskCreate,
    service: TaskService = Depends(get_task_service),
) -> Envelope[TaskResponse]:
    task = await service.create_task(
        title=body.title,
        task_type=body.task_type,
        project_id=body.project_id,
        story_id=body.story_id,
        objective=body.objective,
        priority=body.priority,
        estimate_points=body.estimate_points,
        due_at=body.due_at,
    )
    return Envelope(data=TaskResponse(**task.__dict__))


@router.get("")
async def list_tasks(
    service: TaskService = Depends(get_task_service),
    key: str | None = Query(None),
    project_id: str | None = Depends(resolve_project_key),
    story_id: str | None = Query(None),
    status: str | None = Query(None),
    assignee_id: str | None = Query(None),
    sort: str = Query("-created_at"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> ListEnvelope[TaskResponse]:
    items, total = await service.list_tasks(
        key=key,
        project_id=project_id,
        story_id=story_id,
        status=status,
        assignee_id=assignee_id,
        limit=limit,
        offset=offset,
        sort=sort,
    )
    return ListEnvelope(
        data=[TaskResponse(**t.__dict__) for t in items],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    service: TaskService = Depends(get_task_service),
) -> Envelope[TaskDetailResponse]:
    task, assignments = await service.get_task(task_id)
    return Envelope(
        data=TaskDetailResponse(
            **task.__dict__,
            assignments=[TaskAssignmentResponse(**a.__dict__) for a in assignments],
        )
    )


@router.patch("/{task_id}")
async def update_task(
    task_id: str,
    body: TaskUpdate,
    service: TaskService = Depends(get_task_service),
) -> Envelope[TaskResponse]:
    data = body.model_dump(exclude_unset=True)
    task = await service.update_task(task_id, data)
    return Envelope(data=TaskResponse(**task.__dict__))


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: str,
    service: TaskService = Depends(get_task_service),
) -> None:
    await service.delete_task(task_id)


@router.post("/{task_id}/labels", status_code=201)
async def attach_label(
    task_id: str,
    body: TaskAttachLabel,
    service: TaskService = Depends(get_task_service),
) -> Envelope[dict[str, str]]:
    await service.attach_label(task_id, body.label_id)
    return Envelope(data={"task_id": task_id, "label_id": body.label_id})


@router.delete("/{task_id}/labels/{label_id}", status_code=204)
async def detach_label(
    task_id: str,
    label_id: str,
    service: TaskService = Depends(get_task_service),
) -> None:
    await service.detach_label(task_id, label_id)


@router.post("/{task_id}/assignments", status_code=201)
async def assign_agent(
    task_id: str,
    body: TaskAssignAgent,
    service: TaskService = Depends(get_task_service),
) -> Envelope[TaskAssignmentResponse]:
    assignment = await service.assign_agent(task_id, body.agent_id)
    return Envelope(data=TaskAssignmentResponse(**assignment.__dict__))


@router.delete("/{task_id}/assignments/{agent_id}", status_code=204)
async def unassign_agent(
    task_id: str,
    agent_id: str,
    service: TaskService = Depends(get_task_service),
) -> None:
    await service.unassign_agent(task_id, agent_id)
