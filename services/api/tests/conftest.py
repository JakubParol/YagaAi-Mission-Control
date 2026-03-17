# pylint: disable=redefined-outer-name
from __future__ import annotations

import asyncio
import os
from collections.abc import Iterator
from pathlib import Path

os.environ.setdefault(
    "MC_API_POSTGRES_DSN",
    "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/mission_control_test",
)

# pylint: disable=wrong-import-position
import pytest  # noqa: E402
from testcontainers.postgres import PostgresContainer  # noqa: E402

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from app.config import settings  # noqa: E402
from app.observability.infrastructure import (  # noqa: E402,F401  # pylint: disable=unused-import
    tables as observability_tables,
)
from app.orchestration.infrastructure import (  # noqa: E402,F401  # pylint: disable=unused-import
    tables as orchestration_tables,
)
from app.planning.infrastructure import (  # noqa: E402,F401  # pylint: disable=unused-import
    tables as planning_tables,
)
from app.shared.db.metadata import metadata  # noqa: E402,F401  # pylint: disable=unused-import
from app.shared.db.session import close_db_engine  # noqa: E402
from tests.support.postgres_compat import (  # noqa: E402
    reset_database_schema,
    truncate_all_tables,
)

# pylint: enable=wrong-import-position

_TABLE_NAMES: list[str] = [t.name for t in reversed(metadata.sorted_tables)]


def _alembic_config(database_url: str) -> Config:
    api_root = Path(__file__).resolve().parents[1]
    config = Config(str(api_root / "alembic.ini"))
    config.set_main_option("script_location", str(api_root / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


@pytest.fixture(scope="session")
def database_url() -> Iterator[str]:
    with PostgresContainer("postgres:16-alpine") as postgres:
        url = postgres.get_connection_url()
        url = url.replace("postgresql+psycopg2://", "postgresql+psycopg://")
        url = url.replace("postgresql://", "postgresql+psycopg://")
        settings.postgres_dsn = url
        command.upgrade(_alembic_config(url), "head")
        yield url


@pytest.fixture(scope="session", autouse=True)
def _configure_database(
    database_url: str,
) -> Iterator[None]:
    settings.postgres_dsn = database_url
    yield
    asyncio.run(close_db_engine())


@pytest.fixture(autouse=True)
def _reset_database(database_url: str) -> Iterator[None]:
    truncate_all_tables(database_url, table_names=_TABLE_NAMES)
    yield


@pytest.fixture()
def restore_schema(database_url: str) -> Iterator[None]:
    """Use on tests that modify schema (DROP TABLE/INDEX)."""
    yield
    reset_database_schema(database_url)
