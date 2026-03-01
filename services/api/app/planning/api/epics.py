from fastapi import APIRouter, Depends, Query

from app.planning.api.schemas import EpicCreate, EpicDetailResponse, EpicResponse, EpicUpdate
from app.planning.application.epic_service import EpicService
from app.planning.dependencies import get_epic_service
from app.shared.api.envelope import Envelope, ListEnvelope, ListMeta

router = APIRouter(prefix="/epics", tags=["planning/epics"])


@router.post("", status_code=201)
async def create_epic(
    body: EpicCreate,
    service: EpicService = Depends(get_epic_service),
) -> Envelope[EpicResponse]:
    epic = await service.create_epic(
        project_id=body.project_id,
        title=body.title,
        description=body.description,
        priority=body.priority,
    )
    return Envelope(data=EpicResponse(**epic.__dict__))


@router.get("")
async def list_epics(
    service: EpicService = Depends(get_epic_service),
    project_id: str | None = Query(None),
    status: str | None = Query(None),
    sort: str = Query("-created_at"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> ListEnvelope[EpicResponse]:
    items, total = await service.list_epics(
        project_id=project_id, status=status, limit=limit, offset=offset, sort=sort
    )
    return ListEnvelope(
        data=[EpicResponse(**e.__dict__) for e in items],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/{epic_id}")
async def get_epic(
    epic_id: str,
    service: EpicService = Depends(get_epic_service),
) -> Envelope[EpicDetailResponse]:
    epic, story_count = await service.get_epic(epic_id)
    return Envelope(data=EpicDetailResponse(**epic.__dict__, story_count=story_count))


@router.patch("/{epic_id}")
async def update_epic(
    epic_id: str,
    body: EpicUpdate,
    service: EpicService = Depends(get_epic_service),
) -> Envelope[EpicResponse]:
    data = body.model_dump(exclude_unset=True)
    epic = await service.update_epic(epic_id, data)
    return Envelope(data=EpicResponse(**epic.__dict__))


@router.delete("/{epic_id}", status_code=204)
async def delete_epic(
    epic_id: str,
    service: EpicService = Depends(get_epic_service),
) -> None:
    await service.delete_epic(epic_id)
