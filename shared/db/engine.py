import asyncio
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from shared.config import get_settings

_engine: AsyncEngine | None = None
_engine_loop: asyncio.AbstractEventLoop | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Loop-aware: recreated when the running event loop changes.

    A single long-lived uvicorn process only ever has one loop for its
    whole lifetime, so in production this builds the engine once and reuses
    it — no behavior change there. But `TestClient` (its anyio portal) and
    `asyncio.run()` each spin up a fresh loop, and reusing an engine/pool
    opened on a now-closed loop raises "Future attached to a different
    loop" — so tests need this to rebuild per loop.
    """
    global _engine, _engine_loop, _sessionmaker
    loop = asyncio.get_event_loop()
    if _engine is None or _engine_loop is not loop:
        settings = get_settings()
        _engine = create_async_engine(
            settings.DATABASE_URL, pool_pre_ping=True, echo=settings.DB_ECHO
        )
        _engine_loop = loop
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    assert _sessionmaker is not None
    return _sessionmaker


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency."""
    async with get_sessionmaker()() as session:
        yield session
