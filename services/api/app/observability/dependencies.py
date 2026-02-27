import aiosqlite
from fastapi import Depends

from app.config import settings
from app.observability.application.import_service import ImportService
from app.observability.application.metrics_service import MetricsService
from app.observability.infrastructure.langfuse_client import HttpLangfuseClient
from app.observability.infrastructure.langfuse_repository import SqliteLangfuseRepository
from app.shared.api.deps import get_db


async def get_metrics_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> MetricsService:
    return MetricsService(SqliteLangfuseRepository(db))


async def get_import_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> ImportService:
    repo = SqliteLangfuseRepository(db)
    client = HttpLangfuseClient(
        host=settings.langfuse_host,
        public_key=settings.langfuse_public_key,
        secret_key=settings.langfuse_secret_key,
    )
    return ImportService(repo, client)
