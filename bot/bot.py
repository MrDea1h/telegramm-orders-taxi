import asyncio
import logging

from aiogram import Bot, Dispatcher, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from shared.config import get_settings
from shared.db.migrate import upgrade_to_head

router = Router(name="core")


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    # Real onboarding/order flows live in the PWA now, not the bot (see the
    # M1 pivot) — the bot's only job is this liveness reply plus a WebApp
    # button, which is what actually lets a Mini App `initData` payload ever
    # get produced (opening a plain link does not).
    settings = get_settings()
    markup = None
    if settings.WEBAPP_URL:
        button = InlineKeyboardButton(
            text="Открыть CorpRide", web_app=WebAppInfo(url=settings.WEBAPP_URL)
        )
        markup = InlineKeyboardMarkup(inline_keyboard=[[button]])
    await message.answer("CorpRide bot is alive.", reply_markup=markup)


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
