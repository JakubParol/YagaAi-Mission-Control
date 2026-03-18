from fastapi import APIRouter, Depends, Query

from app.planning.api.schemas.backlog import (
    ActiveSprintItemResponse,
    ActiveSprintResponse,
    BacklogAddItem,
    BacklogCreate,
    BacklogItemRankUpdateRequest,
    BacklogItemResponse,
    BacklogKindTransitionRequest,
    BacklogResponse,
    BacklogUpdate,
    BacklogWithItemsResponse,
    SprintCompleteRequest,
    SprintMembershipRequest,
    SprintMembershipResponse,
)
from app.planning.application.backlog_service import BacklogService
from app.planning.dependencies import get_backlog_service, resolve_project_key
from app.planning.domain.models import BacklogKind
from app.shared.api.envelope import Envelope, ListEnvelope, ListMeta
from app.shared.api.errors import ValidationError

router = APIRouter(prefix="/backlogs", tags=["planning/backlogs"])


def _backlog_response(b) -> BacklogResponse:
    return BacklogResponse(**b.__dict__)


def _validate_backlog_project_scope(backlog_project_id: str | None, project_id: str | None) -> None:
    if project_id is None:
        return
    if project_id == "null":
        if backlog_project_id is not None:
            raise ValidationError("Backlog does not belong to global scope")
        return
    if backlog_project_id != project_id:
        raise ValidationError(f"Backlog does not belong to project {project_id}")


# ------------------------------------------------------------------
# Active sprint (MUST be before /{backlog_id} to avoid route clash)
# ------------------------------------------------------------------


@router.get("/active-sprint")
async def get_active_sprint(
    project_id: str | None = Depends(resolve_project_key),
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[ActiveSprintResponse]:
    if not project_id:
        raise ValidationError("Either project_id or project_key is required")
    backlog, items = await service.get_active_sprint(project_id)
    return Envelope(
        data=ActiveSprintResponse(
            backlog=_backlog_response(backlog),
            items=[ActiveSprintItemResponse(**item) for item in items],
        )
    )


@router.post("/active-sprint/items")
async def add_item_to_active_sprint(
    body: SprintMembershipRequest,
    project_id: str | None = Depends(resolve_project_key),
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[SprintMembershipResponse]:
    if not project_id:
        raise ValidationError("Either project_id or project_key is required")
    result = await service.move_item_to_active_sprint(
        project_id=project_id, work_item_id=body.work_item_id
    )
    return Envelope(data=SprintMembershipResponse(**result))


@router.delete("/active-sprint/items/{work_item_id}")
async def remove_item_from_active_sprint(
    work_item_id: str,
    project_id: str | None = Depends(resolve_project_key),
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[SprintMembershipResponse]:
    if not project_id:
        raise ValidationError("Either project_id or project_key is required")
    result = await service.move_item_to_product_backlog(
        project_id=project_id, work_item_id=work_item_id
    )
    return Envelope(data=SprintMembershipResponse(**result))


# ------------------------------------------------------------------
# CRUD
# ------------------------------------------------------------------


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
    return Envelope(data=_backlog_response(backlog))


@router.get("")
async def list_backlogs(
    service: BacklogService = Depends(get_backlog_service),
    project_id: str | None = Depends(resolve_project_key),
    status: str | None = Query(None),
    kind: str | None = Query(None),
    sort: str | None = Query(None),
    include: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> ListEnvelope[BacklogResponse] | ListEnvelope[BacklogWithItemsResponse]:
    filter_global = project_id == "null"
    actual_project_id = None if filter_global else project_id

    backlogs, total = await service.list_backlogs(
        project_id=actual_project_id,
        filter_global=filter_global,
        status=status,
        kind=kind,
        limit=limit,
        offset=offset,
        sort=sort,
    )

    if include == "items":
        backlog_ids = [b.id for b in backlogs]
        items_by_backlog = await service.get_backlog_items_batch(backlog_ids)
        return ListEnvelope(
            data=[
                BacklogWithItemsResponse(
                    **b.__dict__,
                    items=items_by_backlog.get(b.id, []),
                )
                for b in backlogs
            ],
            meta=ListMeta(total=total, limit=limit, offset=offset),
        )

    return ListEnvelope(
        data=[_backlog_response(b) for b in backlogs],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/{backlog_id}")
async def get_backlog(
    backlog_id: str,
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[BacklogResponse]:
    backlog = await service.get_backlog(backlog_id)
    counts = await service.get_backlog_counts(backlog_id)
    return Envelope(data=_backlog_response(backlog), meta=counts)


@router.patch("/{backlog_id}")
async def update_backlog(
    backlog_id: str,
    body: BacklogUpdate,
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[BacklogResponse]:
    data = body.model_dump(exclude_unset=True)
    backlog = await service.update_backlog(backlog_id, data)
    return Envelope(data=_backlog_response(backlog))


@router.delete("/{backlog_id}", status_code=204)
async def delete_backlog(
    backlog_id: str,
    service: BacklogService = Depends(get_backlog_service),
) -> None:
    await service.delete_backlog(backlog_id)


# ------------------------------------------------------------------
# Lifecycle
# ------------------------------------------------------------------


@router.post("/{backlog_id}/start")
async def start_sprint(
    backlog_id: str,
    project_id: str | None = Depends(resolve_project_key),
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[BacklogResponse]:
    backlog = await service.get_backlog(backlog_id)
    _validate_backlog_project_scope(backlog.project_id, project_id)
    updated, meta = await service.start_sprint(backlog_id)
    return Envelope(data=_backlog_response(updated), meta=meta)


@router.post("/{backlog_id}/complete")
async def complete_sprint(
    backlog_id: str,
    body: SprintCompleteRequest,
    project_id: str | None = Depends(resolve_project_key),
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[BacklogResponse]:
    backlog = await service.get_backlog(backlog_id)
    _validate_backlog_project_scope(backlog.project_id, project_id)
    updated, meta = await service.complete_sprint(
        backlog_id, target_backlog_id=body.target_backlog_id
    )
    return Envelope(data=_backlog_response(updated), meta=meta)


@router.post("/{backlog_id}/transition-kind")
async def transition_backlog_kind(
    backlog_id: str,
    body: BacklogKindTransitionRequest,
    project_id: str | None = Depends(resolve_project_key),
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[BacklogResponse]:
    backlog = await service.get_backlog(backlog_id)
    _validate_backlog_project_scope(backlog.project_id, project_id)
    updated, meta = await service.transition_backlog_kind(
        backlog_id, target_kind=BacklogKind(body.kind)
    )
    return Envelope(data=_backlog_response(updated), meta=meta)


# ------------------------------------------------------------------
# Item membership (unified)
# ------------------------------------------------------------------


@router.post("/{backlog_id}/items", status_code=201)
async def add_item_to_backlog(
    backlog_id: str,
    body: BacklogAddItem,
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[BacklogItemResponse]:
    result = await service.add_item_to_backlog(backlog_id, body.work_item_id, body.rank)
    return Envelope(data=BacklogItemResponse(**result))


@router.get("/{backlog_id}/items")
async def list_backlog_items(
    backlog_id: str,
    service: BacklogService = Depends(get_backlog_service),
) -> Envelope[list[dict]]:
    items = await service.get_backlog_items(backlog_id)
    return Envelope(data=items)


@router.delete("/{backlog_id}/items/{work_item_id}", status_code=204)
async def remove_item_from_backlog(
    backlog_id: str,
    work_item_id: str,
    service: BacklogService = Depends(get_backlog_service),
) -> None:
    await service.remove_item_from_backlog(backlog_id, work_item_id)


@router.patch("/{backlog_id}/items/{work_item_id}/rank")
async def update_item_rank(
    backlog_id: str,
    work_item_id: str,
    body: BacklogItemRankUpdateRequest,
    service: BacklogService = Depends(get_backlog_service),
) -> dict:
    await service.update_item_rank(backlog_id, work_item_id, body.rank)
    return {"updated": True}
