from fastapi import APIRouter, Depends, Query

from app.planning.api.schemas import (
    ActiveSprintResponse,
    BacklogAddStory,
    BacklogAddTask,
    BacklogCreate,
    BacklogReorderRequest,
    BacklogReorderResponse,
    BacklogResponse,
    BacklogStoryItemResponse,
    BacklogTaskItemResponse,
    BacklogUpdate,
    SprintStoryResponse,
)
from app.planning.application.backlog_service import BacklogService
from app.planning.dependencies import get_backlog_service
from app.planning.domain.models import BacklogKind
from app.shared.api.envelope import Envelope, ListEnvelope, ListMeta

router = APIRouter(prefix="/backlogs", tags=["planning/backlogs"])


@router.post("", status_code=201)
async def create_backlog(
    body: BacklogCreate,
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[BacklogResponse]:
    backlog = await service.create_backlog(
        project_id=body.project_id,
        name=body.name,
        kind=BacklogKind(body.kind),
        goal=body.goal,
        start_date=body.start_date,
        end_date=body.end_date,
    )
    return Envelope(data=BacklogResponse(**backlog.__dict__))


@router.get("")
async def list_backlogs(
    service: BacklogService = Depends(get_backlog_service),
    project_id: str | None = Query(None),
    status: str | None = Query(None),
    kind: str | None = Query(None),
    sort: str = Query("-created_at"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> ListEnvelope[BacklogResponse]:
    filter_global = project_id == "null"
    actual_project_id = None if filter_global else project_id

    items, total = await service.list_backlogs(
        project_id=actual_project_id,
        filter_global=filter_global,
        status=status,
        kind=kind,
        limit=limit,
        offset=offset,
        sort=sort,
    )
    return ListEnvelope(
        data=[BacklogResponse(**b.__dict__) for b in items],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/active-sprint")
async def get_active_sprint(
    project_id: str = Query(...),
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[ActiveSprintResponse]:
    backlog, stories = await service.get_active_sprint(project_id)
    return Envelope(
        data=ActiveSprintResponse(
            backlog=BacklogResponse(**backlog.__dict__),
            stories=[SprintStoryResponse(**s) for s in stories],
        )
    )


@router.get("/{backlog_id}")
async def get_backlog(
    backlog_id: str,
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[BacklogResponse]:
    backlog = await service.get_backlog(backlog_id)
    counts = await service.get_backlog_counts(backlog_id)
    return Envelope(
        data=BacklogResponse(**backlog.__dict__),
        meta=counts,
    )


@router.patch("/{backlog_id}")
async def update_backlog(
    backlog_id: str,
    body: BacklogUpdate,
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[BacklogResponse]:
    data = body.model_dump(exclude_unset=True)
    backlog = await service.update_backlog(backlog_id, data)
    return Envelope(data=BacklogResponse(**backlog.__dict__))


@router.delete("/{backlog_id}", status_code=204)
async def delete_backlog(
    backlog_id: str,
    service: BacklogService = Depends(get_backlog_service),
) -> None:
    await service.delete_backlog(backlog_id)


@router.post("/{backlog_id}/stories")
async def add_story_to_backlog(
    backlog_id: str,
    body: BacklogAddStory,
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[BacklogStoryItemResponse]:
    item = await service.add_story_to_backlog(backlog_id, body.story_id, body.position)
    return Envelope(
        data=BacklogStoryItemResponse(
            backlog_id=item.backlog_id,
            story_id=item.story_id,
            position=item.position,
            added_at=item.added_at,
        )
    )


@router.delete("/{backlog_id}/stories/{story_id}", status_code=204)
async def remove_story_from_backlog(
    backlog_id: str,
    story_id: str,
    service: BacklogService = Depends(get_backlog_service),
) -> None:
    await service.remove_story_from_backlog(backlog_id, story_id)


@router.post("/{backlog_id}/tasks")
async def add_task_to_backlog(
    backlog_id: str,
    body: BacklogAddTask,
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[BacklogTaskItemResponse]:
    item = await service.add_task_to_backlog(backlog_id, body.task_id, body.position)
    return Envelope(
        data=BacklogTaskItemResponse(
            backlog_id=item.backlog_id,
            task_id=item.task_id,
            position=item.position,
            added_at=item.added_at,
        )
    )


@router.delete("/{backlog_id}/tasks/{task_id}", status_code=204)
async def remove_task_from_backlog(
    backlog_id: str,
    task_id: str,
    service: BacklogService = Depends(get_backlog_service),
) -> None:
    await service.remove_task_from_backlog(backlog_id, task_id)


@router.patch("/{backlog_id}/reorder")
async def reorder_backlog_items(
    backlog_id: str,
    body: BacklogReorderRequest,
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[BacklogReorderResponse]:
    summary = await service.reorder_backlog_items(
        backlog_id,
        [row.model_dump() for row in body.stories],
        [row.model_dump() for row in body.tasks],
    )
    return Envelope(data=BacklogReorderResponse(**summary))
