import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest

from shared.telegram_init_data import InitDataInvalid, verify_init_data
from shared.telegram_login_widget import LoginWidgetInvalid, verify_login_widget_payload

BOT_TOKEN = "123456:test-bot-token"


def _sign_login_widget(data: dict) -> dict:
    check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret_key = hashlib.sha256(BOT_TOKEN.encode()).digest()
    data = dict(data)
    data["hash"] = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()
    return data


def _sign_init_data(pairs: dict) -> str:
    check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    pairs = dict(pairs)
    pairs["hash"] = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(pairs)


def test_login_widget_valid_payload_accepted():
    data = _sign_login_widget(
        {
            "id": "12345",
            "first_name": "Anna",
            "username": "anna_k",
            "auth_date": str(int(time.time())),
        }
    )
    result = verify_login_widget_payload(data)
    assert result["telegram_id"] == 12345
    assert result["username"] == "anna_k"


def test_login_widget_tampered_payload_rejected():
    data = _sign_login_widget(
        {"id": "12345", "first_name": "Anna", "auth_date": str(int(time.time()))}
    )
    data["first_name"] = "Hacker"
    with pytest.raises(LoginWidgetInvalid):
        verify_login_widget_payload(data)


def test_login_widget_stale_auth_date_rejected():
    stale_time = str(int(time.time()) - 999_999)
    data = _sign_login_widget({"id": "12345", "first_name": "Anna", "auth_date": stale_time})
    with pytest.raises(LoginWidgetInvalid):
        verify_login_widget_payload(data)


def test_init_data_valid_payload_accepted():
    user_json = json.dumps({"id": 12345, "first_name": "Anna", "username": "anna_k"})
    raw = _sign_init_data({"user": user_json, "auth_date": str(int(time.time()))})
    result = verify_init_data(raw)
    assert result["telegram_id"] == 12345


def test_init_data_stale_auth_date_rejected():
    user_json = json.dumps({"id": 12345, "first_name": "Anna"})
    stale_time = str(int(time.time()) - 999_999)
    raw = _sign_init_data({"user": user_json, "auth_date": stale_time})
    with pytest.raises(InitDataInvalid):
        verify_init_data(raw)


def test_algorithms_are_not_interchangeable():
    """A hash computed with the Login Widget's secret-key derivation must
    NOT validate against the Mini App initData verifier, and vice versa —
    these are deliberately different algorithms (see the module docstrings)."""
    user_json = json.dumps({"id": 12345, "first_name": "Anna"})
    pairs = {"user": user_json, "auth_date": str(int(time.time()))}
    check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))

    wrong_secret = hashlib.sha256(BOT_TOKEN.encode()).digest()  # login-widget style
    bad_hash = hmac.new(wrong_secret, check_string.encode(), hashlib.sha256).hexdigest()
    bad_pairs = dict(pairs)
    bad_pairs["hash"] = bad_hash

    with pytest.raises(InitDataInvalid):
        verify_init_data(urlencode(bad_pairs))
