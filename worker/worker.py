import asyncio

from arq.connections import RedisSettings

from shared.config import get_settings
from shared.db.migrate import upgrade_to_head

settings = get_settings()


async def on_startup(ctx: dict) -> None:
    # Run off arq's event loop in a worker thread, same reason as the FastAPI
    # lifespan hook: Alembic's env.py does its own asyncio.run(), which can't
    # nest inside an already-running loop. NOTE: this can't run at import
    # time here (unlike bot.main()) — arq's Worker.__init__ calls the
    # deprecated asyncio.get_event_loop(), which raises once asyncio.run()
    # has already created-and-closed a loop on the main thread beforehand.
    await asyncio.get_running_loop().run_in_executor(None, upgrade_to_head)


async def on_shutdown(ctx: dict) -> None:
    pass


async def noop(ctx: dict) -> str:
    """Placeholder task — arq's Worker refuses to start with zero functions
    and zero cron_jobs registered. Real jobs (reminders, auto-expire) land
    in M4; this just proves the worker process boots and can execute a job."""
    return "ok"


class WorkerSettings:
    functions: list = [noop]  # M4 adds reminder_job, auto_expire_unaccepted_orders, ...
    cron_jobs: list = []  # M4 adds cron(auto_expire_unaccepted_orders, minute=...), ...
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    on_startup = staticmethod(on_startup)
    on_shutdown = staticmethod(on_shutdown)
