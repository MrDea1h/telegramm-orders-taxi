import asyncio
import logging

from aiogram import Bot, Dispatcher, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.types import Message

from shared.config import get_settings
from shared.db.migrate import upgrade_to_head

router = Router(name="core")


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    # Real onboarding / Telegram Login Widget / order flows land in later
    # milestones — this is only a liveness check for M1. The bot is an
    # additional entry channel now, not the primary UI (see M1 plan): the
    # PWA is reachable standalone, this account is optional convenience.
    await message.answer("CorpRide bot is alive.")


async def _run_polling(settings) -> None:
    bot = Bot(token=settings.BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    storage = RedisStorage.from_url(settings.REDIS_URL)
    dp = Dispatcher(storage=storage)
    dp.include_router(router)
    await dp.start_polling(bot)


def main() -> None:
    settings = get_settings()
    logging.basicConfig(level=settings.LOG_LEVEL)
    if not settings.BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN is not set")
    upgrade_to_head()
    # BOT_MODE=webhook branch is a TODO for the prod milestone — polling
    # only for M1, per the "must run locally with no server yet" constraint.
    asyncio.run(_run_polling(settings))


if __name__ == "__main__":
    main()
