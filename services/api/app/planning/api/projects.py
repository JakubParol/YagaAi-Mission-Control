from fastapi import APIRouter, Depends, Query

from app.planning.api.schemas import ProjectCreate, ProjectResponse, ProjectUpdate
from app.planning.application.project_service import ProjectService
from app.planning.dependencies import get_project_service
from app.shared.api.envelope import Envelope, ListEnvelope, ListMeta

router = APIRouter(prefix="/projects", tags=["planning/projects"])


@router.post("", status_code=201)
async def create_project(
    body: ProjectCreate,
    service: ProjectService = Depends(get_project_service),
) -> Envelope[ProjectResponse]:
    project = await service.create_project(
        key=body.key, name=body.name, description=body.description, repo_root=body.repo_root
    )
    return Envelope(data=ProjectResponse(**project.__dict__))


@router.get("")
async def list_projects(
    service: ProjectService = Depends(get_project_service),
    key: str | None = Query(None),
    status: str | None = Query(None),
    sort: str = Query("-created_at"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> ListEnvelope[ProjectResponse]:
    items, total = await service.list_projects(key=key, status=status, limit=limit, offset=offset, sort=sort)
    return ListEnvelope(
        data=[ProjectResponse(**p.__dict__) for p in items],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    service: ProjectService = Depends(get_project_service),
) -> Envelope[ProjectResponse]:
    project = await service.get_project(project_id)
    return Envelope(data=ProjectResponse(**project.__dict__))


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    service: ProjectService = Depends(get_project_service),
) -> Envelope[ProjectResponse]:
    data = body.model_dump(exclude_unset=True)
    project = await service.update_project(project_id, data)
    return Envelope(data=ProjectResponse(**project.__dict__))


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    service: ProjectService = Depends(get_project_service),
) -> None:
    await service.delete_project(project_id)
