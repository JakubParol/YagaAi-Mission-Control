from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from app.observability.application.import_service import ImportService
from app.observability.application.metrics_service import MetricsService
from app.observability.dependencies import (
    get_import_service,
    get_metrics_service,
)

router = APIRouter(tags=["observability"])


# --- Costs ---


@router.get("/costs")
async def get_costs(
    service: MetricsService = Depends(get_metrics_service),
    from_param: str | None = Query(None, alias="from"),
    to_param: str | None = Query(None, alias="to"),
    days: int | None = Query(None),
) -> dict:
    if from_param and to_param:
        from_str = from_param
        to_str = to_param
    else:
        valid_days = days if days in (1, 7, 30) else 7
        now = datetime.now(timezone.utc)
        from_date = now - timedelta(days=valid_days)
        from_str = from_date.strftime("%Y-%m-%d")
        to_str = now.strftime("%Y-%m-%d")

    return await service.get_costs(from_str, to_str)


# --- Requests ---


@router.get("/requests")
async def get_requests(
    service: MetricsService = Depends(get_metrics_service),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    model: str | None = Query(None),
    from_param: str | None = Query(None, alias="from"),
    to_param: str | None = Query(None, alias="to"),
) -> dict:
    return await service.get_requests(page, limit, model, from_param, to_param)


@router.get("/requests/models")
async def get_request_models(
    service: MetricsService = Depends(get_metrics_service),
) -> dict:
    models = await service.get_distinct_models()
    return {"models": models}


# --- Imports ---


@router.post("/imports")
async def trigger_import(
    service: ImportService = Depends(get_import_service),
) -> dict:
    return await service.run_import()


@router.get("/imports/status")
async def get_import_status(
    service: MetricsService = Depends(get_metrics_service),
) -> dict:
    return await service.get_import_status()
