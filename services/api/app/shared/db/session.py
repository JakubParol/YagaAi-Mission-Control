from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

_state: dict[str, AsyncEngine | async_sessionmaker[AsyncSession]] = {}

_ENGINE_KEY = "engine"
_FACTORY_KEY = "factory"


def get_async_engine() -> AsyncEngine:
    engine = _state.get(_ENGINE_KEY)
    if isinstance(engine, AsyncEngine):
        return engine
    new_engine = create_async_engine(
        settings.postgres_dsn,
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
    )
    _state[_ENGINE_KEY] = new_engine
    return new_engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    factory = _state.get(_FACTORY_KEY)
    if isinstance(factory, async_sessionmaker):
        return factory
    new_factory = async_sessionmaker(
        get_async_engine(),
        expire_on_commit=False,
        autoflush=False,
    )
    _state[_FACTORY_KEY] = new_factory
    return new_factory


async def init_db_engine() -> None:
    get_async_engine()


async def close_db_engine() -> None:
    engine = _state.get(_ENGINE_KEY)
    if not isinstance(engine, AsyncEngine):
        return
    await engine.dispose()
    _state.clear()


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
