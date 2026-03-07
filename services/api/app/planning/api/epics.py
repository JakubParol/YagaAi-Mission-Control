from fastapi import APIRouter, Depends, Header, Query

from app.planning.api.schemas import (
    BulkOperationItemResult,
    BulkOperationResponse,
    EpicCreate,
    EpicDetailResponse,
    EpicOverviewResponse,
    EpicResponse,
    EpicStatusChangeRequest,
    EpicStatusChangeResponse,
    EpicUpdate,
    SprintBulkMembershipRequest,
    StoryBulkStatusUpdateRequest,
)
from app.planning.application.epic_overview_action_service import EpicOverviewActionService
from app.planning.application.epic_service import EpicService
from app.planning.dependencies import (
    get_epic_overview_action_service,
    get_epic_service,
    resolve_project_key,
)
from app.shared.api.envelope import Envelope, ListEnvelope, ListMeta
from app.shared.api.errors import ValidationError

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
    key: str | None = Query(None),
    project_id: str | None = Depends(resolve_project_key),
    status: str | None = Query(None),
    sort: str = Query("-created_at"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> ListEnvelope[EpicResponse]:
    items, total = await service.list_epics(
        key=key, project_id=project_id, status=status, limit=limit, offset=offset, sort=sort
    )
    return ListEnvelope(
        data=[EpicResponse(**e.__dict__) for e in items],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/overview")
async def list_epic_overview(
    service: EpicService = Depends(get_epic_service),
    project_id: str | None = Depends(resolve_project_key),
    status: str | None = Query(None),
    owner: str | None = Query(None),
    is_blocked: bool | None = Query(None),
    label: str | None = Query(None),
    text: str | None = Query(None),
    sort: str = Query("-updated_at"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> ListEnvelope[EpicOverviewResponse]:
    items, total = await service.list_epic_overview(
        project_id=project_id,
        status=status,
        owner=owner,
        is_blocked=is_blocked,
        label=label,
        text=text,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    return ListEnvelope(
        data=[EpicOverviewResponse(**item.__dict__) for item in items],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/by-key/{key}")
async def get_epic_by_key(
    key: str,
    service: EpicService = Depends(get_epic_service),
) -> Envelope[EpicDetailResponse]:
    epic, story_count = await service.get_epic_by_key(key)
    return Envelope(data=EpicDetailResponse(**epic.__dict__, story_count=story_count))


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


@router.post("/{epic_id}/status")
async def change_epic_status(
    epic_id: str,
    body: EpicStatusChangeRequest,
    service: EpicOverviewActionService = Depends(get_epic_overview_action_service),
    actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    actor_type: str | None = Header(default=None, alias="X-Actor-Type"),
) -> Envelope[EpicStatusChangeResponse]:
    result = await service.change_epic_status(
        epic_id=epic_id,
        status=body.status,
        actor_id=actor_id,
        actor_type=actor_type,
    )
    return Envelope(data=EpicStatusChangeResponse(**result.__dict__))


@router.post("/bulk/story-status")
async def bulk_update_story_status(
    body: StoryBulkStatusUpdateRequest,
    service: EpicOverviewActionService = Depends(get_epic_overview_action_service),
    actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    actor_type: str | None = Header(default=None, alias="X-Actor-Type"),
) -> Envelope[BulkOperationResponse]:
    result = await service.bulk_update_story_status(
        story_ids=body.story_ids,
        status=body.status,
        actor_id=actor_id,
        actor_type=actor_type,
    )
    return Envelope(
        data=BulkOperationResponse(
            operation=result.operation,
            total=result.total,
            succeeded=result.succeeded,
            failed=result.failed,
            results=[
                BulkOperationItemResult(
                    entity_id=item.entity_id,
                    success=item.success,
                    timestamp=item.timestamp,
                    error_code=item.error_code,
                    error_message=item.error_message,
                )
                for item in result.results
            ],
        )
    )


@router.post("/bulk/active-sprint/add")
async def bulk_add_to_active_sprint(
    body: SprintBulkMembershipRequest,
    project_id: str | None = Depends(resolve_project_key),
    service: EpicOverviewActionService = Depends(get_epic_overview_action_service),
    actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    actor_type: str | None = Header(default=None, alias="X-Actor-Type"),
) -> Envelope[BulkOperationResponse]:
    if not project_id:
        raise ValidationError("Either project_id or project_key is required")

    result = await service.bulk_add_stories_to_active_sprint(
        project_id=project_id,
        story_ids=body.story_ids,
        actor_id=actor_id,
        actor_type=actor_type,
    )
    return Envelope(
        data=BulkOperationResponse(
            operation=result.operation,
            total=result.total,
            succeeded=result.succeeded,
            failed=result.failed,
            results=[
                BulkOperationItemResult(
                    entity_id=item.entity_id,
                    success=item.success,
                    timestamp=item.timestamp,
                    error_code=item.error_code,
                    error_message=item.error_message,
                )
                for item in result.results
            ],
        )
    )


@router.post("/bulk/active-sprint/remove")
async def bulk_remove_from_active_sprint(
    body: SprintBulkMembershipRequest,
    project_id: str | None = Depends(resolve_project_key),
    service: EpicOverviewActionService = Depends(get_epic_overview_action_service),
    actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    actor_type: str | None = Header(default=None, alias="X-Actor-Type"),
) -> Envelope[BulkOperationResponse]:
    if not project_id:
        raise ValidationError("Either project_id or project_key is required")

    result = await service.bulk_remove_stories_from_active_sprint(
        project_id=project_id,
        story_ids=body.story_ids,
        actor_id=actor_id,
        actor_type=actor_type,
    )
    return Envelope(
        data=BulkOperationResponse(
            operation=result.operation,
            total=result.total,
            succeeded=result.succeeded,
            failed=result.failed,
            results=[
                BulkOperationItemResult(
                    entity_id=item.entity_id,
                    success=item.success,
                    timestamp=item.timestamp,
                    error_code=item.error_code,
                    error_message=item.error_message,
                )
                for item in result.results
            ],
        )
    )
