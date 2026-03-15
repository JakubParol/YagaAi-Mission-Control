from __future__ import annotations

import asyncio
import os
import sqlite3
from collections.abc import Iterator
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault(
    "MC_API_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/mission_control_test",
)

import aiosqlite
import pytest
from testcontainers.postgres import PostgresContainer

from alembic import command
from alembic.config import Config
from app.config import settings
from app.observability.infrastructure import tables as observability_tables  # noqa: F401
from app.orchestration.infrastructure import tables as orchestration_tables  # noqa: F401
from app.planning.infrastructure import tables as planning_tables  # noqa: F401
from app.shared.db.metadata import metadata
from app.shared.db.session import close_db_engine
from tests.support.postgres_compat import (
    aiosqlite_connect,
    reset_database_schema,
    sqlite_connect,
)


def _alembic_config(database_url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


@pytest.fixture(scope="session")
def database_url() -> Iterator[str]:
    with PostgresContainer("postgres:16-alpine") as postgres:
        url = postgres.get_connection_url()
        url = url.replace("postgresql+psycopg2://", "postgresql+psycopg://")
        url = url.replace("postgresql://", "postgresql+psycopg://")
        settings.database_url = url
        command.upgrade(_alembic_config(url), "head")
        yield url


@pytest.fixture(scope="session", autouse=True)
def _configure_database(database_url: str) -> Iterator[None]:
    settings.database_url = database_url
    yield


@pytest.fixture(autouse=True)
def _reset_database(database_url: str) -> Iterator[None]:
    reset_database_schema(database_url)
    yield


@pytest.fixture(autouse=True)
def _reset_engine_state(database_url: str) -> Iterator[None]:
    settings.database_url = database_url
    asyncio.run(close_db_engine())
    yield
    asyncio.run(close_db_engine())


@pytest.fixture(autouse=True)
def _patch_sqlite_clients(database_url: str) -> Iterator[None]:
    with (
        patch.object(
            sqlite3,
            "connect",
            lambda *args, **kwargs: sqlite_connect(database_url, *args, **kwargs),
        ),
        patch.object(
            aiosqlite,
            "connect",
            lambda *args, **kwargs: aiosqlite_connect(database_url, *args, **kwargs),
        ),
    ):
        yield
