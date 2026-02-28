from fastapi import APIRouter, Depends, Query

from app.planning.api.schemas import LabelCreate, LabelResponse
from app.planning.application.label_service import LabelService
from app.planning.dependencies import get_label_service
from app.shared.api.envelope import Envelope, ListEnvelope, ListMeta

router = APIRouter(prefix="/labels", tags=["planning/labels"])


@router.post("", status_code=201)
async def create_label(
    body: LabelCreate,
    service: LabelService = Depends(get_label_service),
) -> Envelope[LabelResponse]:
    label = await service.create_label(name=body.name, project_id=body.project_id, color=body.color)
    return Envelope(data=LabelResponse(**label.__dict__))


@router.get("")
async def list_labels(
    service: LabelService = Depends(get_label_service),
    project_id: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> ListEnvelope[LabelResponse]:
    filter_global = project_id == "null"
    actual_project_id = None if filter_global else project_id

    items, total = await service.list_labels(
        project_id=actual_project_id,
        filter_global=filter_global,
        limit=limit,
        offset=offset,
    )
    return ListEnvelope(
        data=[LabelResponse(**label.__dict__) for label in items],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/{label_id}")
async def get_label(
    label_id: str,
    service: LabelService = Depends(get_label_service),
) -> Envelope[LabelResponse]:
    label = await service.get_label(label_id)
    return Envelope(data=LabelResponse(**label.__dict__))


@router.delete("/{label_id}", status_code=204)
async def delete_label(
    label_id: str,
    service: LabelService = Depends(get_label_service),
) -> None:
    await service.delete_label(label_id)
