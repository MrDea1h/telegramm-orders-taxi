import logging

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramNetworkError, TelegramRetryAfter
from aiogram.types import InlineKeyboardMarkup
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from shared.config import get_settings

logger = logging.getLogger(__name__)
_bot: Bot | None = None


def _get_bot() -> Bot:
    """Own Bot instance, independent of bot/bot.py's long-lived polling
    Dispatcher — importable from api/ and worker/ without pulling in
    aiogram's Dispatcher/FSM machinery."""
    global _bot
    if _bot is None:
        settings = get_settings()
        _bot = Bot(
            token=settings.BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML)
        )
    return _bot


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((TelegramRetryAfter, TelegramNetworkError)),
)
async def send_message(
    chat_id: int, text: str, reply_markup: InlineKeyboardMarkup | None = None
) -> None:
    """STUB for M1 — no call sites yet. Web Push is the primary notification
    channel (see M1 plan); this stays available as an optional best-effort
    channel for users who linked Telegram, wired up if/when M4 decides to
    use it alongside push."""
    bot = _get_bot()
    await bot.send_message(chat_id=chat_id, text=text, reply_markup=reply_markup)
