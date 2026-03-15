from pathlib import Path

from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory


def _alembic_config(*, database_url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[3] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def _get_current_revision(connection: Connection) -> str | None:
    context = MigrationContext.configure(connection)
    return context.get_current_revision()


async def assert_database_revision_is_current(engine: AsyncEngine, *, database_url: str) -> None:
    config = _alembic_config(database_url=database_url)
    script = ScriptDirectory.from_config(config)
    expected_head = script.get_current_head()
    if expected_head is None:
        return

    async with engine.connect() as connection:
        current_revision = await connection.run_sync(_get_current_revision)

    if current_revision != expected_head:
        msg = (
            "Database revision mismatch. "
            f"Current revision: {current_revision or 'none'}, "
            f"expected head: {expected_head}. "
            "Run `alembic upgrade head` before starting the API."
        )
        raise RuntimeError(msg)
