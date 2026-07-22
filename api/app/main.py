import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.app import admin_api, auth_api, push_api
from api.app.errors import register_error_handlers
from shared.config import get_settings
from shared.db.migrate import upgrade_to_head

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # force=True: uvicorn already attaches its own handlers to the root
    # logger before this runs, which makes a plain basicConfig() a silent
    # no-op (Python only configures the root logger if it has no handlers
    # yet) — force=True guarantees our level/format actually takes effect.
    logging.basicConfig(level=settings.LOG_LEVEL, force=True)
    # uvicorn's own logging setup runs logging.config.dictConfig(...) with
    # the (default) disable_existing_loggers=True, which retroactively
    # disables every logger created at import time before that point —
    # including shared/*'s module-level `getLogger(__name__)` loggers.
    # basicConfig's force=True fixes handlers, but not the `.disabled` flag
    # dictConfig set on those pre-existing loggers, so re-enable them
    # explicitly (otherwise shared/email_send.py's dev-mode code-in-logs
    # fallback silently produces no output).
    for name in logging.root.manager.loggerDict:
        logging.getLogger(name).disabled = False
    # Alembic's env.py does its own asyncio.run() — run it in a worker
    # thread so it doesn't collide with FastAPI's already-running loop.
    await asyncio.get_running_loop().run_in_executor(None, upgrade_to_head)
    logger.info("migrations applied to head; api starting")
    yield
    logger.info("api shutting down")


app = FastAPI(title="CorpRide API", lifespan=lifespan)

register_error_handlers(app)

_settings = get_settings()
_cors_origins = _settings.cors_allow_origins()
if not _cors_origins and _settings.ENV == "dev":
    # Zero-config default so a local Vite dev server can call the API
    # without any .env setup.
    _cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # No cookies are used anywhere (refresh token travels in the JSON body,
    # not a cookie — see the M2 plan's auth design), so credentials support
    # adds CORS complexity for no benefit.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_api.router)
app.include_router(admin_api.router)
app.include_router(push_api.router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
