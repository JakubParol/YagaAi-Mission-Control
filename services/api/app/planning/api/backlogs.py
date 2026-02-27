from fastapi import APIRouter, Depends, Query

from app.planning.api.schemas import BacklogCreate, BacklogResponse, BacklogUpdate
from app.planning.application.backlog_service import BacklogService
from app.planning.dependencies import get_backlog_service
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
        kind=body.kind,
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
