import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from shared.config import get_settings
from shared.db.migrate import upgrade_to_head

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logging.basicConfig(level=settings.LOG_LEVEL)
    # Alembic's env.py does its own asyncio.run() — run it in a worker
    # thread so it doesn't collide with FastAPI's already-running loop.
    await asyncio.get_running_loop().run_in_executor(None, upgrade_to_head)
    logger.info("migrations applied to head; api starting")
    yield
    logger.info("api shutting down")


app = FastAPI(title="CorpRide API", lifespan=lifespan)

# TODO(M2): CORS — allow_origins from settings.CORS_ALLOW_ORIGINS once the
# webapp's deployed origin is known; allow_credentials for the refresh
# cookie.
# TODO(M2): auth dependency — validate one of (JWT bearer, Mini App
# initData, Telegram Login Widget payload) on every /v1/* route except
# /healthz.


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
