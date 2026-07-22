import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.ext.asyncio import async_engine_from_config

from shared.config import get_settings
from shared.db import models  # noqa: F401 -- import so Base.metadata is populated
from shared.db.base import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().DATABASE_URL)
target_metadata = Base.metadata

# api/bot/worker each call upgrade_to_head() independently on their own
# startup (see shared/db/migrate.py) and docker-compose brings them all up
# concurrently — without serializing, two processes can both see "not yet
# at head" and race to apply the same migration (DuplicateColumnError,
# etc). A session-scoped Postgres advisory lock on the migration
# connection makes the second one wait, then find nothing left to do.
_MIGRATION_LOCK_KEY = 727100001


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.execute(
            text("SELECT pg_advisory_lock(:key)"), {"key": _MIGRATION_LOCK_KEY}
        )
        # pg_advisory_lock is session-scoped, not transaction-scoped, so
        # it's safe (and necessary) to close out its own implicit
        # transaction here: without this commit, Alembic's own
        # begin_transaction() below nests INSIDE it instead of starting a
        # fresh top-level transaction, and since nothing ever commits this
        # outer one, closing the connection at the end of this block rolls
        # it back — silently discarding the entire migration.
        await connection.commit()
        try:
            await connection.run_sync(do_run_migrations)
        finally:
            await connection.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": _MIGRATION_LOCK_KEY}
            )
            await connection.commit()
    await connectable.dispose()


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().DATABASE_URL, target_metadata=target_metadata, literal_binds=True
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
