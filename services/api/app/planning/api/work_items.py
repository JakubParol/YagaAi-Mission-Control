from fastapi import APIRouter, Depends, Header, Query, Response

from app.planning.api.schemas.bulk import (
    BulkOperationItemResult,
    BulkOperationResponse,
    BulkSprintMembershipRequest,
    BulkStatusUpdateRequest,
)
from app.planning.api.schemas.work_item import (
    WorkItemAssignAgentRequest,
    WorkItemAssignmentResponse,
    WorkItemAttachLabelRequest,
    WorkItemCreate,
    WorkItemDetailResponse,
    WorkItemOverviewResponse,
    WorkItemResponse,
    WorkItemStatusChangeRequest,
    WorkItemStatusChangeResponse,
    WorkItemUpdate,
)
from app.planning.application.work_item_action_service import WorkItemActionService
from app.planning.application.work_item_service import WorkItemService
from app.planning.dependencies import (
    get_work_item_action_service,
    get_work_item_service,
    resolve_project_key,
)
from app.shared.api.envelope import ListEnvelope, ListMeta

router = APIRouter(prefix="/work-items", tags=["work-items"])


# ------------------------------------------------------------------
# CRUD
# ------------------------------------------------------------------


@router.post("/", status_code=201, response_model=WorkItemResponse)
async def create_work_item(
    body: WorkItemCreate,
    svc: WorkItemService = Depends(get_work_item_service),
    x_actor_id: str | None = Header(None),
):
    item = await svc.create_work_item(
        type=body.type,
        title=body.title,
        project_id=body.project_id,
        parent_id=body.parent_id,
        sub_type=body.sub_type,
        summary=body.summary,
        description=body.description,
        priority=body.priority,
        estimate_points=body.estimate_points,
        due_at=body.due_at,
        current_assignee_agent_id=body.current_assignee_agent_id,
        actor=x_actor_id,
    )
    return WorkItemResponse(**_to_dict(item))


@router.get("/", response_model=ListEnvelope[WorkItemResponse])
async def list_work_items(
    project_id: str | None = Depends(resolve_project_key),
    type: str | None = Query(None),
    parent_id: str | None = Query(None),
    status: str | None = Query(None),
    assignee_id: str | None = Query(None),
    key: str | None = Query(None),
    sub_type: str | None = Query(None),
    is_blocked: bool | None = Query(None),
    text_search: str | None = Query(None),
    sort: str = Query("-created_at"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    svc: WorkItemService = Depends(get_work_item_service),
):
    items, total = await svc.list_work_items(
        type=type,
        project_id=project_id,
        parent_id=parent_id,
        status=status,
        assignee_id=assignee_id,
        key=key,
        sub_type=sub_type,
        is_blocked=is_blocked,
        text_search=text_search,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    return ListEnvelope(
        data=[WorkItemResponse(**_to_dict(i)) for i in items],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/overview", response_model=ListEnvelope[WorkItemOverviewResponse])
async def list_overview(
    project_id: str | None = Depends(resolve_project_key),
    type: str | None = Query(None),
    status: str | None = Query(None),
    assignee_id: str | None = Query(None),
    is_blocked: bool | None = Query(None),
    label: str | None = Query(None),
    text_search: str | None = Query(None),
    sort: str = Query("-updated_at"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    svc: WorkItemService = Depends(get_work_item_service),
):
    items, total = await svc.list_overview(
        type=type,
        project_id=project_id,
        status=status,
        assignee_id=assignee_id,
        is_blocked=is_blocked,
        label=label,
        text_search=text_search,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    return ListEnvelope(
        data=[WorkItemOverviewResponse(**_overview_to_dict(i)) for i in items],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/by-key/{key}", response_model=WorkItemDetailResponse)
async def get_by_key(
    key: str,
    svc: WorkItemService = Depends(get_work_item_service),
):
    item, children_count = await svc.get_work_item_by_key(key)
    assignments = await svc.list_assignments(item.id)
    return WorkItemDetailResponse(
        **_to_dict(item),
        children_count=children_count,
        assignments=[
            WorkItemAssignmentResponse(**_assignment_to_dict(a))
            for a in assignments
        ],
    )


@router.get("/{work_item_id}", response_model=WorkItemDetailResponse)
async def get_work_item(
    work_item_id: str,
    svc: WorkItemService = Depends(get_work_item_service),
):
    item, children_count = await svc.get_work_item(work_item_id)
    assignments = await svc.list_assignments(item.id)
    return WorkItemDetailResponse(
        **_to_dict(item),
        children_count=children_count,
        assignments=[
            WorkItemAssignmentResponse(**_assignment_to_dict(a))
            for a in assignments
        ],
    )


@router.patch("/{work_item_id}", response_model=WorkItemResponse)
async def update_work_item(
    work_item_id: str,
    body: WorkItemUpdate,
    svc: WorkItemService = Depends(get_work_item_service),
    x_actor_id: str | None = Header(None),
):
    data = body.model_dump(exclude_unset=True)
    updated = await svc.update_work_item(work_item_id, data, actor=x_actor_id)
    return WorkItemResponse(**_to_dict(updated))


@router.delete("/{work_item_id}", status_code=204)
async def delete_work_item(
    work_item_id: str,
    svc: WorkItemService = Depends(get_work_item_service),
):
    await svc.delete_work_item(work_item_id)
    return Response(status_code=204)


# ------------------------------------------------------------------
# Children
# ------------------------------------------------------------------


@router.get("/{work_item_id}/children", response_model=ListEnvelope[WorkItemResponse])
async def list_children(
    work_item_id: str,
    type: str | None = Query(None),
    status: str | None = Query(None),
    sort: str = Query("-created_at"),
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    svc: WorkItemService = Depends(get_work_item_service),
):
    items, total = await svc.list_children(
        work_item_id, type=type, status=status, sort=sort, limit=limit, offset=offset
    )
    return ListEnvelope(
        data=[WorkItemResponse(**_to_dict(i)) for i in items],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


# ------------------------------------------------------------------
# Labels
# ------------------------------------------------------------------


@router.post("/{work_item_id}/labels", status_code=201)
async def attach_label(
    work_item_id: str,
    body: WorkItemAttachLabelRequest,
    svc: WorkItemService = Depends(get_work_item_service),
):
    await svc.attach_label(work_item_id, body.label_id)
    return {"attached": True}


@router.delete("/{work_item_id}/labels/{label_id}", status_code=204)
async def detach_label(
    work_item_id: str,
    label_id: str,
    svc: WorkItemService = Depends(get_work_item_service),
):
    await svc.detach_label(work_item_id, label_id)
    return Response(status_code=204)


# ------------------------------------------------------------------
# Assignments
# ------------------------------------------------------------------


@router.post(
    "/{work_item_id}/assignments",
    status_code=201,
    response_model=WorkItemAssignmentResponse,
)
async def assign_agent(
    work_item_id: str,
    body: WorkItemAssignAgentRequest,
    svc: WorkItemService = Depends(get_work_item_service),
    x_actor_id: str | None = Header(None),
):
    assignment = await svc.assign_agent(
        work_item_id, body.agent_id, assigned_by=x_actor_id
    )
    return WorkItemAssignmentResponse(**_assignment_to_dict(assignment))


@router.get(
    "/{work_item_id}/assignments",
    response_model=list[WorkItemAssignmentResponse],
)
async def list_assignments(
    work_item_id: str,
    svc: WorkItemService = Depends(get_work_item_service),
):
    assignments = await svc.list_assignments(work_item_id)
    return [
        WorkItemAssignmentResponse(**_assignment_to_dict(a))
        for a in assignments
    ]


@router.delete("/{work_item_id}/assignments/current", status_code=204)
async def unassign_current(
    work_item_id: str,
    svc: WorkItemService = Depends(get_work_item_service),
):
    await svc.unassign_current_agent(work_item_id)
    return Response(status_code=204)


# ------------------------------------------------------------------
# Status change with audit
# ------------------------------------------------------------------


@router.post(
    "/{work_item_id}/status",
    response_model=WorkItemStatusChangeResponse,
)
async def change_status(
    work_item_id: str,
    body: WorkItemStatusChangeRequest,
    action_svc: WorkItemActionService = Depends(get_work_item_action_service),
    x_actor_id: str | None = Header(None),
    x_actor_type: str | None = Header(None),
):
    result = await action_svc.change_status(
        work_item_id=work_item_id,
        status=body.status,
        actor_id=x_actor_id,
        actor_type=x_actor_type,
    )
    return WorkItemStatusChangeResponse(
        work_item_id=result.work_item_id,
        from_status=result.from_status,
        to_status=result.to_status,
        changed=result.changed,
        actor_id=result.actor_id,
        timestamp=result.timestamp,
    )


# ------------------------------------------------------------------
# Bulk operations
# ------------------------------------------------------------------


@router.post("/bulk/status", response_model=BulkOperationResponse)
async def bulk_update_status(
    body: BulkStatusUpdateRequest,
    action_svc: WorkItemActionService = Depends(get_work_item_action_service),
    x_actor_id: str | None = Header(None),
    x_actor_type: str | None = Header(None),
):
    result = await action_svc.bulk_update_status(
        work_item_ids=body.work_item_ids,
        status=body.status,
        actor_id=x_actor_id,
        actor_type=x_actor_type,
    )
    return BulkOperationResponse(
        operation=result.operation,
        total=result.total,
        succeeded=result.succeeded,
        failed=result.failed,
        results=[
            BulkOperationItemResult(
                entity_id=r.entity_id,
                success=r.success,
                timestamp=r.timestamp,
                error_code=r.error_code,
                error_message=r.error_message,
            )
            for r in result.results
        ],
    )


@router.post("/bulk/active-sprint/add", response_model=BulkOperationResponse)
async def bulk_add_to_sprint(
    body: BulkSprintMembershipRequest,
    project_id: str = Query(...),
    action_svc: WorkItemActionService = Depends(get_work_item_action_service),
    x_actor_id: str | None = Header(None),
    x_actor_type: str | None = Header(None),
):
    result = await action_svc.bulk_add_to_active_sprint(
        project_id=project_id,
        work_item_ids=body.work_item_ids,
        actor_id=x_actor_id,
        actor_type=x_actor_type,
    )
    return BulkOperationResponse(
        operation=result.operation,
        total=result.total,
        succeeded=result.succeeded,
        failed=result.failed,
        results=[
            BulkOperationItemResult(
                entity_id=r.entity_id,
                success=r.success,
                timestamp=r.timestamp,
                error_code=r.error_code,
                error_message=r.error_message,
            )
            for r in result.results
        ],
    )


@router.post("/bulk/active-sprint/remove", response_model=BulkOperationResponse)
async def bulk_remove_from_sprint(
    body: BulkSprintMembershipRequest,
    project_id: str = Query(...),
    action_svc: WorkItemActionService = Depends(get_work_item_action_service),
    x_actor_id: str | None = Header(None),
    x_actor_type: str | None = Header(None),
):
    result = await action_svc.bulk_remove_from_active_sprint(
        project_id=project_id,
        work_item_ids=body.work_item_ids,
        actor_id=x_actor_id,
        actor_type=x_actor_type,
    )
    return BulkOperationResponse(
        operation=result.operation,
        total=result.total,
        succeeded=result.succeeded,
        failed=result.failed,
        results=[
            BulkOperationItemResult(
                entity_id=r.entity_id,
                success=r.success,
                timestamp=r.timestamp,
                error_code=r.error_code,
                error_message=r.error_message,
            )
            for r in result.results
        ],
    )


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _to_dict(item):
    return {
        "id": item.id,
        "type": item.type.value,
        "project_id": item.project_id,
        "parent_id": item.parent_id,
        "key": item.key,
        "title": item.title,
        "sub_type": item.sub_type,
        "summary": item.summary,
        "description": item.description,
        "status": item.status.value,
        "status_mode": item.status_mode.value,
        "status_override": item.status_override,
        "is_blocked": item.is_blocked,
        "blocked_reason": item.blocked_reason,
        "priority": item.priority,
        "estimate_points": item.estimate_points,
        "due_at": item.due_at,
        "current_assignee_agent_id": item.current_assignee_agent_id,
        "metadata_json": item.metadata_json,
        "created_by": item.created_by,
        "updated_by": item.updated_by,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "started_at": item.started_at,
        "completed_at": item.completed_at,
    }


def _overview_to_dict(item):
    return {
        "work_item_key": item.work_item_key,
        "title": item.title,
        "type": item.type.value,
        "status": item.status.value,
        "progress_pct": item.progress_pct,
        "progress_trend_7d": item.progress_trend_7d,
        "children_total": item.children_total,
        "children_done": item.children_done,
        "children_in_progress": item.children_in_progress,
        "blocked_count": item.blocked_count,
        "stale_days": item.stale_days,
        "priority": item.priority,
        "updated_at": item.updated_at,
    }


def _assignment_to_dict(a):
    return {
        "id": a.id,
        "work_item_id": a.work_item_id,
        "agent_id": a.agent_id,
        "assigned_at": a.assigned_at,
        "unassigned_at": a.unassigned_at,
        "assigned_by": a.assigned_by,
        "reason": a.reason,
    }
