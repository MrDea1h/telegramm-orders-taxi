import os

import pytest
from alembic import command
from alembic.config import Config
from testcontainers.postgres import PostgresContainer

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
