import os

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

from shared.config import get_settings

# testcontainers over a compose test DB: self-manages container lifecycle
# inside the pytest process, works identically locally and on GitHub Actions
# (the Docker daemon is already present, no extra `services:` block needed),
# and avoids port clashes with a dev `docker compose up` stack that might
# already be running locally on 5432.


@pytest.fixture(scope="session", autouse=True)
def database_url():
    with PostgresContainer("postgres:16-alpine") as pg:
        url = pg.get_connection_url()
        # testcontainers defaults to the psycopg2 dialect string; the app
        # stack is asyncpg-only.
        url = url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
        # Set the env var (not just yield the value): env.py always derives
        # sqlalchemy.url from get_settings().DATABASE_URL as the single
        # source of truth for real app boot, overriding whatever a Config
        # object was given directly — so tests must go through the env var,
        # same as api/bot/worker do.
        os.environ["DATABASE_URL"] = url
        get_settings.cache_clear()
        yield url
        get_settings.cache_clear()


@pytest.fixture(scope="session", autouse=True)
def _migrate(database_url):
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", database_url)
    cfg.set_main_option("script_location", "shared/db/migrations")
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session", autouse=True)
def redis_url():
    with RedisContainer("redis:7-alpine") as redis:
        url = f"redis://{redis.get_container_host_ip()}:{redis.get_exposed_port(6379)}/0"
        os.environ["REDIS_URL"] = url
        get_settings.cache_clear()
        yield url
        get_settings.cache_clear()


@pytest.fixture(scope="session", autouse=True)
def _auth_env(redis_url):
    """JWT/Telegram auth modules need a non-empty BOT_TOKEN/JWT_SECRET —
    fixed test values so HMAC test vectors are reproducible across runs."""
    os.environ["BOT_TOKEN"] = "123456:test-bot-token"
    os.environ["JWT_SECRET"] = "test-jwt-secret"
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
async def _clean_tables(_migrate):
    """Function-scoped truncate — the Postgres/Redis containers are
    session-scoped for speed, so each test needs a clean slate rather than
    accumulating users/codes/events across the whole file."""
    from shared.db.engine import get_sessionmaker
    from shared.redis_client import get_redis

    async with get_sessionmaker()() as session:
        await session.execute(
            text(
                "TRUNCATE users, user_events, push_subscriptions,"
                " orders, order_events, addresses, driver_time_off, driver_schedule,"
                " drivers, settings CASCADE"
            )
        )
        await session.commit()
    await get_redis().flushdb()
    yield


@pytest.fixture
def client():
    """Lazy import (after the env-setting fixtures above have already run)
    — same reasoning as tests/test_api_smoke.py's lazy import."""
    from fastapi.testclient import TestClient

    from api.app.main import app

    with TestClient(app) as c:
        yield c
