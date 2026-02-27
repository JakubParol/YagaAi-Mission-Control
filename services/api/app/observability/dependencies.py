import sqlite3
from collections.abc import AsyncGenerator

import aiosqlite
from fastapi import Depends

from app.config import settings
from app.observability.application.dashboard_service import DashboardService
from app.observability.application.import_service import ImportService
from app.observability.application.workflow_service import WorkflowService
from app.observability.infrastructure.langfuse_client import HttpLangfuseClient
from app.observability.infrastructure.langfuse_repository import SqliteLangfuseRepository
from app.observability.infrastructure.workflow_adapter import FilesystemWorkflowAdapter


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = sqlite3.Row
        yield db


async def get_dashboard_service(
    db: aiosqlite.Connection = Depends(get_db),
) -> DashboardService:
    return DashboardService(SqliteLangfuseRepository(db))


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


def get_workflow_service() -> WorkflowService:
    adapter = FilesystemWorkflowAdapter(settings.workflow_system_path)
    return WorkflowService(adapter)
