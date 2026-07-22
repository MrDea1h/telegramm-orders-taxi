from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from shared.config import get_settings

settings = get_settings()
engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True, echo=settings.DB_ECHO)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency — not wired to any route yet in M1 (lands in M2)."""
    async with AsyncSessionLocal() as session:
        yield session
