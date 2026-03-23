import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response

from app.config import settings
from app.control_plane.api.dapr_router import router as control_plane_dapr_router
from app.control_plane.api.naomi_queue import router as control_plane_naomi_queue_router
from app.control_plane.api.router import router as control_plane_router
from app.observability.api.router import router as observability_router
from app.planning.api.router import router as planning_router
from app.shared.api.errors import AppError, app_error_handler, generic_error_handler
from app.shared.api.health import router as health_router
from app.shared.db.revision_check import assert_database_revision_is_current
from app.shared.db.session import close_db_engine, get_async_engine, init_db_engine
from app.shared.logging import configure_logging, log_event

configure_logging(level=settings.log_level)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await init_db_engine()
    await assert_database_revision_is_current(
        get_async_engine(),
        database_url=settings.postgres_dsn,
    )
    try:
        yield
    finally:
        await close_db_engine()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, generic_error_handler)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next) -> Response:
    started_at = time.perf_counter()
    request_id = request.headers.get("X-Request-Id") or str(uuid4())
    correlation_id = request.headers.get("X-Correlation-Id")
    actor_id = request.headers.get("X-Actor-Id")
    actor_type = request.headers.get("X-Actor-Type")

    request.state.request_id = request_id

    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id

    duration_ms = round((time.perf_counter() - started_at) * 1000, 3)
    log_event(
        logger,
        level=logging.INFO,
        event="http.request.completed",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=duration_ms,
        actor_id=actor_id,
        actor_type=actor_type,
        correlation_id=correlation_id,
    )
    return response


app.include_router(health_router)
app.include_router(planning_router, prefix="/v1/planning")
app.include_router(observability_router, prefix="/v1/observability")
app.include_router(control_plane_router, prefix="/v1/control-plane")
app.include_router(control_plane_naomi_queue_router, prefix="/v1/control-plane")
app.include_router(control_plane_dapr_router)
