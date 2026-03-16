from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

_ENGINE: AsyncEngine | None = None
_SESSION_FACTORY: async_sessionmaker[AsyncSession] | None = None


def get_async_engine() -> AsyncEngine:
    global _ENGINE  # pylint: disable=global-statement
    if _ENGINE is None:
        _ENGINE = create_async_engine(
            settings.postgres_dsn,
            pool_pre_ping=True,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
        )
    return _ENGINE


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _SESSION_FACTORY  # pylint: disable=global-statement
    if _SESSION_FACTORY is None:
        _SESSION_FACTORY = async_sessionmaker(
            get_async_engine(),
            expire_on_commit=False,
            autoflush=False,
        )
    return _SESSION_FACTORY


async def init_db_engine() -> None:
    get_async_engine()


async def close_db_engine() -> None:
    global _ENGINE, _SESSION_FACTORY  # pylint: disable=global-statement
    if _ENGINE is None:
        return
    await _ENGINE.dispose()
    _ENGINE = None
    _SESSION_FACTORY = None


async def get_db_session() -> AsyncIterator[AsyncSession]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
