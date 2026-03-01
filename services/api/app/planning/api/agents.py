from fastapi import APIRouter, Depends, Query

from app.planning.api.schemas import AgentCreate, AgentResponse, AgentUpdate
from app.planning.application.agent_service import AgentService
from app.planning.dependencies import get_agent_service
from app.planning.domain.models import AgentSource
from app.shared.api.envelope import Envelope, ListEnvelope, ListMeta

router = APIRouter(prefix="/agents", tags=["planning/agents"])


@router.post("", status_code=201)
async def create_agent(
    body: AgentCreate,
    service: AgentService = Depends(get_agent_service),
) -> Envelope[AgentResponse]:
    agent = await service.create_agent(
        openclaw_key=body.openclaw_key,
        name=body.name,
        role=body.role,
        worker_type=body.worker_type,
        is_active=body.is_active,
        source=AgentSource(body.source),
        metadata_json=body.metadata_json,
    )
    return Envelope(data=AgentResponse(**agent.__dict__))


@router.get("")
async def list_agents(
    service: AgentService = Depends(get_agent_service),
    key: str | None = Query(None),
    is_active: bool | None = Query(None),
    source: str | None = Query(None),
    sort: str = Query("-created_at"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> ListEnvelope[AgentResponse]:
    items, total = await service.list_agents(
        key=key, is_active=is_active, source=source, limit=limit, offset=offset, sort=sort
    )
    return ListEnvelope(
        data=[AgentResponse(**a.__dict__) for a in items],
        meta=ListMeta(total=total, limit=limit, offset=offset),
    )


@router.get("/{agent_id}")
async def get_agent(
    agent_id: str,
    service: AgentService = Depends(get_agent_service),
) -> Envelope[AgentResponse]:
    agent = await service.get_agent(agent_id)
    return Envelope(data=AgentResponse(**agent.__dict__))


@router.patch("/{agent_id}")
async def update_agent(
    agent_id: str,
    body: AgentUpdate,
    service: AgentService = Depends(get_agent_service),
) -> Envelope[AgentResponse]:
    data = body.model_dump(exclude_unset=True)
    agent = await service.update_agent(agent_id, data)
    return Envelope(data=AgentResponse(**agent.__dict__))


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: str,
    service: AgentService = Depends(get_agent_service),
) -> None:
    await service.delete_agent(agent_id)
