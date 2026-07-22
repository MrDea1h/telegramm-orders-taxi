import asyncio

from redis.asyncio import Redis

from shared.config import get_settings

_redis: Redis | None = None
_redis_loop: asyncio.AbstractEventLoop | None = None


def get_redis() -> Redis:
    """Lazy singleton, API-side only — bot/worker build their own independent
    Redis connections (aiogram RedisStorage, arq RedisSettings).

    Reset when the running event loop changes: a single long-lived uvicorn
    process only ever has one loop in production, but test clients (and
    pytest-asyncio across test functions) can spin up a fresh loop per call
    — reusing a client whose connection pool was opened on a now-closed
    loop raises "Future attached to a different loop"."""
    global _redis, _redis_loop
    loop = asyncio.get_event_loop()
    if _redis is None or _redis_loop is not loop:
        _redis = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
        _redis_loop = loop
    return _redis
