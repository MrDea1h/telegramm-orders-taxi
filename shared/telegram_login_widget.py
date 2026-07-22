import hashlib
import hmac
import time
from typing import Any

from shared.config import get_settings


class LoginWidgetInvalid(ValueError):
    pass


def verify_login_widget_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Verifies the payload returned by Telegram's Login Widget
    (https://core.telegram.org/widgets/login#checking-authorization).

    Deliberately a different algorithm from telegram_init_data.verify_init_data
    (Mini App initData) — do not merge the two: this one derives the HMAC
    secret key as a plain SHA-256 of the bot token, not the WebAppData-keyed
    HMAC the Mini App uses.
    """
    settings = get_settings()
    if not settings.BOT_TOKEN:
        raise LoginWidgetInvalid("BOT_TOKEN is not configured")

    received_hash = data.get("hash")
    if not received_hash:
        raise LoginWidgetInvalid("missing hash")

    check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()) if k != "hash")
    secret_key = hashlib.sha256(settings.BOT_TOKEN.encode()).digest()
    computed_hash = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise LoginWidgetInvalid("signature mismatch")

    auth_date = data.get("auth_date")
    if auth_date is None:
        raise LoginWidgetInvalid("missing auth_date")
    if time.time() - int(auth_date) > settings.TELEGRAM_LOGIN_WIDGET_MAX_AGE_SEC:
        raise LoginWidgetInvalid("auth_date is stale")

    return {
        "telegram_id": int(data["id"]),
        "first_name": data.get("first_name"),
        "last_name": data.get("last_name"),
        "username": data.get("username"),
        "photo_url": data.get("photo_url"),
    }
