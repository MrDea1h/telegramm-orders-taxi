from pathlib import Path

from alembic import command
from alembic.config import Config

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _alembic_config() -> Config:
    cfg = Config(str(_REPO_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(_REPO_ROOT / "shared" / "db" / "migrations"))
    return cfg


def upgrade_to_head() -> None:
    """Sync entrypoint. `command.upgrade` -> env.py -> `asyncio.run(...)`
    internally, so this MUST be invoked from a context with no already-
    running event loop (a worker thread from FastAPI's lifespan, or a
    plain sync `main()` in bot/worker before their own `asyncio.run`)."""
    command.upgrade(_alembic_config(), "head")
