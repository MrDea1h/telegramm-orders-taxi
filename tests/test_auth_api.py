import hashlib
import hmac
import time

BOT_TOKEN = "123456:test-bot-token"


def _sign_login_widget(data: dict) -> dict:
    check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret_key = hashlib.sha256(BOT_TOKEN.encode()).digest()
    data = dict(data)
    data["hash"] = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()
    return data


def _login(client, telegram_id: int, first_name: str = "Anna") -> dict:
    payload = _sign_login_widget(
        {"id": str(telegram_id), "first_name": first_name, "auth_date": str(int(time.time()))}
    )
    r = client.post("/v1/auth/telegram/login-widget", json=payload)
    assert r.status_code == 200
    return r.json()


def test_login_widget_creates_pending_user(client):
    body = _login(client, 111)
    assert body["user"]["status"] == "pending"
    assert body["user"]["role"] == "user"
    assert body["user"]["telegram_id"] == 111


def test_login_widget_same_telegram_id_is_idempotent(client):
    first = _login(client, 222)
    second = _login(client, 222)
    assert first["user"]["id"] == second["user"]["id"]


def test_blocked_account_rejected_at_login(client):
    import asyncio

    _login(client, 333)

    async def _block() -> None:
        from sqlalchemy import select

        from shared.db.engine import get_sessionmaker
        from shared.db.models import User

        async with get_sessionmaker()() as session:
            user = (await session.execute(select(User).where(User.telegram_id == 333))).scalar_one()
            user.status = "blocked"
            await session.commit()

    asyncio.run(_block())

    payload = _sign_login_widget(
        {"id": "333", "first_name": "Anna", "auth_date": str(int(time.time()))}
    )
    r = client.post("/v1/auth/telegram/login-widget", json=payload)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "ACCOUNT_BLOCKED"


def test_refresh_rotation_and_logout(client):
    tokens = _login(client, 444)

    old_refresh = tokens["refresh_token"]
    r = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 200
    new_tokens = r.json()
    assert new_tokens["refresh_token"] != old_refresh

    # rotation: the old refresh token is now dead
    r = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "REFRESH_INVALID"

    # logout kills the new refresh token too
    r = client.post("/v1/auth/logout", json={"refresh_token": new_tokens["refresh_token"]})
    assert r.status_code == 204

    r = client.post("/v1/auth/refresh", json={"refresh_token": new_tokens["refresh_token"]})
    assert r.status_code == 401


def test_me_requires_bearer_token(client):
    r = client.get("/v1/auth/me")
    assert r.status_code == 401


def test_me_returns_current_user(client):
    tokens = _login(client, 555)
    r = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert r.status_code == 200
    assert r.json()["telegram_id"] == 555


def test_update_profile_sets_name_and_phone(client):
    tokens = _login(client, 666)
    r = client.patch(
        "/v1/auth/profile",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        json={"full_name": "Иванов Иван", "phone": "+79991234567"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["full_name"] == "Иванов Иван"
    assert body["phone"] == "+79991234567"

    r = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert r.json()["full_name"] == "Иванов Иван"


def test_update_profile_requires_bearer_token(client):
    r = client.patch("/v1/auth/profile", json={"full_name": "X", "phone": "+1"})
    assert r.status_code == 401


def test_update_profile_rejects_empty_fields(client):
    tokens = _login(client, 777)
    r = client.patch(
        "/v1/auth/profile",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        json={"full_name": "", "phone": ""},
    )
    assert r.status_code == 422
