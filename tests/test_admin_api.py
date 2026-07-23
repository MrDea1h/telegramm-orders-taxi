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


def _login(client, telegram_id: int, first_name: str = "User") -> dict:
    payload = _sign_login_widget(
        {"id": str(telegram_id), "first_name": first_name, "auth_date": str(int(time.time()))}
    )
    r = client.post("/v1/auth/telegram/login-widget", json=payload)
    assert r.status_code == 200
    return r.json()


async def _create_admin(telegram_id: int) -> None:
    # Lazy imports: shared.db.engine builds its async engine from
    # DATABASE_URL at import time, which must happen after conftest's
    # database_url fixture has already set that env var.
    from shared.db.engine import get_sessionmaker
    from shared.db.models import User

    async with get_sessionmaker()() as session:
        session.add(
            User(telegram_id=telegram_id, full_name="Admin", role="admin", status="verified")
        )
        await session.commit()


async def _get_user_id(telegram_id: int) -> str:
    from sqlalchemy import select

    from shared.db.engine import get_sessionmaker
    from shared.db.models import User

    async with get_sessionmaker()() as session:
        user = (
            await session.execute(select(User).where(User.telegram_id == telegram_id))
        ).scalar_one()
        return str(user.id)


async def _get_event_payload(event_type: str) -> dict:
    from sqlalchemy import select

    from shared.db.engine import get_sessionmaker
    from shared.db.models import UserEvent

    async with get_sessionmaker()() as session:
        event = (
            await session.execute(select(UserEvent).where(UserEvent.event_type == event_type))
        ).scalar_one()
        return event.payload


ADMIN_TELEGRAM_ID = 900001


def _admin_token(client) -> str:
    import asyncio

    asyncio.run(_create_admin(ADMIN_TELEGRAM_ID))
    return _login(client, ADMIN_TELEGRAM_ID, "Admin")["access_token"]


def test_non_admin_gets_403(client):
    tokens = _login(client, 100001)

    r = client.get(
        "/v1/admin/verification-requests",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"


def test_pending_user_included_in_queue(client):
    admin_token = _admin_token(client)
    _login(client, 100002, "Anna")

    r = client.get(
        "/v1/admin/verification-requests", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert r.status_code == 200
    telegram_ids = [u["telegram_id"] for u in r.json()]
    assert telegram_ids == [100002]


def test_reject_writes_audit_and_blocks_login(client):
    import asyncio

    admin_token = _admin_token(client)
    _login(client, 100003, "Pavel")
    user_id = asyncio.run(_get_user_id(100003))

    r = client.post(
        f"/v1/admin/verification-requests/{user_id}/reject",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "could not verify"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "blocked"

    payload = asyncio.run(_get_event_payload("verification_rejected"))
    assert payload == {"reason": "could not verify"}

    payload = _sign_login_widget(
        {"id": "100003", "first_name": "Pavel", "auth_date": str(int(time.time()))}
    )
    r = client.post("/v1/auth/telegram/login-widget", json=payload)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "ACCOUNT_BLOCKED"


def test_approve_marks_verified(client):
    import asyncio

    admin_token = _admin_token(client)
    _login(client, 100004, "Olga")
    user_id = asyncio.run(_get_user_id(100004))

    r = client.post(
        f"/v1/admin/verification-requests/{user_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "verified"

    r = _login(client, 100004, "Olga")
    assert r["user"]["status"] == "verified"


def test_list_users_returns_all(client):
    admin_token = _admin_token(client)
    _login(client, 100005, "Irina")

    r = client.get("/v1/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    telegram_ids = {u["telegram_id"] for u in r.json()}
    assert {ADMIN_TELEGRAM_ID, 100005} <= telegram_ids


def test_set_role_to_driver_creates_driver_row(client):
    import asyncio

    from sqlalchemy import select

    from shared.db.engine import get_sessionmaker
    from shared.db.models import Driver

    admin_token = _admin_token(client)
    _login(client, 100006, "Dmitry")
    user_id = asyncio.run(_get_user_id(100006))

    r = client.patch(
        f"/v1/admin/users/{user_id}/role",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"role": "driver"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "driver"

    async def _driver_exists() -> bool:
        async with get_sessionmaker()() as session:
            driver = (
                await session.execute(select(Driver).where(Driver.user_id == user_id))
            ).scalar_one_or_none()
            return driver is not None

    assert asyncio.run(_driver_exists())

    payload = asyncio.run(_get_event_payload("role_changed"))
    assert payload == {"from": "user", "to": "driver"}


def test_admin_cannot_change_own_role(client):
    import asyncio

    admin_token = _admin_token(client)
    admin_id = asyncio.run(_get_user_id(ADMIN_TELEGRAM_ID))

    r = client.patch(
        f"/v1/admin/users/{admin_id}/role",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"role": "user"},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "SELF_DEMOTION_FORBIDDEN"
