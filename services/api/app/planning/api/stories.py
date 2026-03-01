from fastapi import APIRouter, Depends, Query

from app.planning.api.schemas import (
    StoryAttachLabel,
    StoryCreate,
    StoryDetailResponse,
    StoryResponse,
    StoryUpdate,
)
from app.planning.application.story_service import StoryService
from app.planning.dependencies import get_story_service, resolve_epic_key, resolve_project_key
from app.shared.api.envelope import Envelope, ListEnvelope, ListMeta

router = APIRouter(prefix="/stories", tags=["planning/stories"])


@router.post("", status_code=201)
async def create_story(
    body: StoryCreate,
    service: StoryService = Depends(get_story_service),
) -> Envelope[StoryResponse]:
    story = await service.create_story(
        title=body.title,
        story_type=body.story_type,
        project_id=body.project_id,
        epic_id=body.epic_id,
        intent=body.intent,
        description=body.description,
        priority=body.priority,
    )
    return Envelope(data=StoryResponse(**story.__dict__))


@router.get("")
async def list_stories(
    service: StoryService = Depends(get_story_service),
    key: str | None = Query(None),
    project_id: str | None = Depends(resolve_project_key),
    epic_id: str | None = Depends(resolve_epic_key),
    status: str | None = Query(None),
    sort: str = Query("-created_at"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> ListEnvelope[StoryResponse]:
    items, total = await service.list_stories(
        key=key,
        project_id=project_id,
        epic_id=epic_id,
        status=status,
        limit=limit,
        offset=offset,
        sort=sort,
    )
    return ListEnvelope(
        data=[StoryResponse(**s.__dict__) for s in items],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/by-key/{key}")
async def get_story_by_key(
    key: str,
    service: StoryService = Depends(get_story_service),
) -> Envelope[StoryDetailResponse]:
    story, task_count = await service.get_story_by_key(key)
    return Envelope(data=StoryDetailResponse(**story.__dict__, task_count=task_count))


@router.get("/{story_id}")
async def get_story(
    story_id: str,
    service: StoryService = Depends(get_story_service),
) -> Envelope[StoryDetailResponse]:
    story, task_count = await service.get_story(story_id)
    return Envelope(data=StoryDetailResponse(**story.__dict__, task_count=task_count))


@router.patch("/{story_id}")
async def update_story(
    story_id: str,
    body: StoryUpdate,
    service: StoryService = Depends(get_story_service),
) -> Envelope[StoryResponse]:
    data = body.model_dump(exclude_unset=True)
    story = await service.update_story(story_id, data)
    return Envelope(data=StoryResponse(**story.__dict__))


@router.delete("/{story_id}", status_code=204)
async def delete_story(
    story_id: str,
    service: StoryService = Depends(get_story_service),
) -> None:
    await service.delete_story(story_id)


@router.post("/{story_id}/labels", status_code=201)
async def attach_label(
    story_id: str,
    body: StoryAttachLabel,
    service: StoryService = Depends(get_story_service),
) -> Envelope[dict[str, str]]:
    await service.attach_label(story_id, body.label_id)
    return Envelope(data={"story_id": story_id, "label_id": body.label_id})


@router.delete("/{story_id}/labels/{label_id}", status_code=204)
async def detach_label(
    story_id: str,
    label_id: str,
    service: StoryService = Depends(get_story_service),
) -> None:
    await service.detach_label(story_id, label_id)
