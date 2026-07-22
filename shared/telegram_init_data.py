import hashlib
import hmac
import json
import time
from typing import Any
from urllib.parse import parse_qsl

from shared.config import get_settings


class InitDataInvalid(ValueError):
    pass


def verify_init_data(raw_init_data: str) -> dict[str, Any]:
    """Verifies a Telegram Mini App `initData` string
    (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).

    Deliberately a different algorithm from telegram_login_widget's Login
    Widget check — do not merge the two: this one derives the HMAC secret
    key via HMAC-SHA256(key=b"WebAppData", msg=bot_token), not a plain
    SHA-256 of the token.
    """
    settings = get_settings()
    if not settings.BOT_TOKEN:
        raise InitDataInvalid("BOT_TOKEN is not configured")

    pairs = dict(parse_qsl(raw_init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise InitDataInvalid("missing hash")

    check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret_key = hmac.new(b"WebAppData", settings.BOT_TOKEN.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise InitDataInvalid("signature mismatch")

    auth_date = pairs.get("auth_date")
    if auth_date is None:
        raise InitDataInvalid("missing auth_date")
    if time.time() - int(auth_date) > settings.INIT_DATA_MAX_AGE_SEC:
        raise InitDataInvalid("auth_date is stale")

    try:
        user = json.loads(pairs["user"])
    except (KeyError, json.JSONDecodeError) as e:
        raise InitDataInvalid("missing or malformed user field") from e

    return {
        "telegram_id": int(user["id"]),
        "first_name": user.get("first_name"),
        "last_name": user.get("last_name"),
        "username": user.get("username"),
        "photo_url": user.get("photo_url"),
    }
