from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.observability.api.router import router as observability_router
from app.shared.api.errors import AppError, app_error_handler, generic_error_handler
from app.shared.api.health import router as health_router
from app.workflow.api.router import router as workflow_router

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(Exception, generic_error_handler)

app.include_router(health_router)
app.include_router(observability_router, prefix="/v1/observability")
app.include_router(workflow_router, prefix="/v1/workflow")
