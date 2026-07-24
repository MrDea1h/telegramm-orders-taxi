"""Telegram notifications for order lifecycle events, built on the
existing send_message stub (shared/telegram_send.py, unused since M1).
Every function here is best-effort: a delivery failure (bot blocked,
account deleted, Telegram outage) must never break the order mutation
that triggered it, so failures are logged and swallowed, never raised.
A bounded timeout is just as important as swallowing errors here — the
underlying send_message() has its own 3-attempt retry with exponential
backoff for transient Telegram errors, so an unreachable/slow Telegram
API without this timeout could stall the order mutation's HTTP response
for a long time instead of failing fast.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
from zoneinfo import ZoneInfo

from shared.config import get_settings
from shared.db.models import Order
from shared.telegram_send import send_message

logger = logging.getLogger(__name__)

_SEND_TIMEOUT_SEC = 5.0


def _fmt_time(moment: dt.datetime) -> str:
    settings = get_settings()
    local = moment.astimezone(ZoneInfo(settings.COMPANY_TZ))
    return local.strftime("%d.%m в %H:%M")


async def _notify(chat_id: int, text: str) -> None:
    try:
        await asyncio.wait_for(send_message(chat_id, text), timeout=_SEND_TIMEOUT_SEC)
    except Exception:
        logger.warning("order notification failed for chat_id=%s", chat_id, exc_info=True)


async def notify_order_accepted(chat_id: int, order: Order, driver_name: str | None) -> None:
    who = f" водителем {driver_name}" if driver_name else ""
    await _notify(
        chat_id,
        f"✅ Ваш заказ на {_fmt_time(order.scheduled_at)} принят{who}.\n"
        f"{order.from_address} → {order.to_address}",
    )


async def notify_order_cancelled(chat_id: int, order: Order, reason: str | None) -> None:
    reason_line = f"\nПричина: {reason}" if reason else ""
    await _notify(chat_id, f"❌ Заказ на {_fmt_time(order.scheduled_at)} отменён.{reason_line}")


async def notify_order_rescheduled(chat_id: int, order: Order) -> None:
    assert order.proposed_scheduled_at is not None
    await _notify(
        chat_id,
        f"🕐 Водитель предложил другое время для поездки {order.from_address} → "
        f"{order.to_address}: {_fmt_time(order.proposed_scheduled_at)}.\n"
        "Подтвердите или отклоните в приложении.",
    )


async def notify_counter_accepted(chat_id: int, order: Order) -> None:
    await _notify(chat_id, f"✅ Клиент подтвердил новое время: {_fmt_time(order.scheduled_at)}.")


async def notify_driver_departed(chat_id: int, order: Order) -> None:
    await _notify(chat_id, f"🚗 Водитель выехал к вам по адресу {order.from_address}.")


async def notify_driver_approaching(chat_id: int, order: Order) -> None:
    await _notify(
        chat_id, f"📍 Водитель будет по адресу {order.from_address} в течение 5–10 минут."
    )


async def notify_driver_arrived(chat_id: int, order: Order) -> None:
    await _notify(chat_id, f"📍 Водитель на месте: {order.from_address}.")


async def notify_new_assignment(
    chat_id: int, order: Order, client_name: str, client_phone: str | None
) -> None:
    phone_line = f"\nТелефон: {client_phone}" if client_phone else ""
    await _notify(
        chat_id,
        f"🆕 Вам назначена новая поездка на {_fmt_time(order.scheduled_at)}.\n"
        f"{order.from_address} → {order.to_address}\n"
        f"Клиент: {client_name}{phone_line}",
    )
