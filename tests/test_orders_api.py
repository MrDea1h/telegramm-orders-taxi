import asyncio
import datetime as dt
import hashlib
import hmac
import time
import uuid

BOT_TOKEN = "123456:test-bot-token"
ADMIN_TELEGRAM_ID = 900301


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


def _auth_header(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def _verify(telegram_id: int) -> None:
    from sqlalchemy import select

    from shared.db.engine import get_sessionmaker
    from shared.db.models import User

    async with get_sessionmaker()() as session:
        user = (
            await session.execute(select(User).where(User.telegram_id == telegram_id))
        ).scalar_one()
        user.status = "verified"
        await session.commit()


async def _create_admin(telegram_id: int) -> None:
    from shared.db.engine import get_sessionmaker
    from shared.db.models import User

    async with get_sessionmaker()() as session:
        session.add(
            User(telegram_id=telegram_id, full_name="Admin", role="admin", status="verified")
        )
        await session.commit()


async def _get_driver_id(user_id: str) -> str:
    from sqlalchemy import select

    from shared.db.engine import get_sessionmaker
    from shared.db.models import Driver

    async with get_sessionmaker()() as session:
        driver = (
            await session.execute(select(Driver).where(Driver.user_id == uuid.UUID(user_id)))
        ).scalar_one()
        return str(driver.id)


def _verified_user(client, telegram_id: int) -> dict:
    tokens = _login(client, telegram_id)
    asyncio.run(_verify(telegram_id))
    return tokens


def _admin_token(client) -> str:
    asyncio.run(_create_admin(ADMIN_TELEGRAM_ID))
    return _login(client, ADMIN_TELEGRAM_ID, "Admin")["access_token"]


def _make_driver(client, telegram_id: int) -> str:
    """Returns the driver's Driver.id (not user id)."""
    admin_token = _admin_token(client)
    tokens = _login(client, telegram_id, "Driver")
    user_id = tokens["user"]["id"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    r = client.patch(
        f"/v1/admin/users/{user_id}/role", headers=admin_headers, json={"role": "driver"}
    )
    assert r.status_code == 200
    r = client.post(f"/v1/admin/verification-requests/{user_id}/approve", headers=admin_headers)
    assert r.status_code == 200
    return asyncio.run(_get_driver_id(user_id))


def _future_iso(days: int = 1, hours: int = 0) -> str:
    return (dt.datetime.now(dt.UTC) + dt.timedelta(days=days, hours=hours)).isoformat()


def _base_body(scheduled_at: str | None = None, **overrides) -> dict:
    body = {
        "idempotency_key": str(uuid.uuid4()),
        "from_address": "ул. Ленина 1",
        "to_address": "ул. Мира 5",
        "scheduled_at": scheduled_at or _future_iso(),
    }
    body.update(overrides)
    return body


def test_create_order_any_driver(client):
    tokens = _verified_user(client, 1301)
    r = client.post("/v1/orders", headers=_auth_header(tokens), json=_base_body(passengers=2))
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "pending_driver"
    assert body["driver_id"] is None
    assert body["passengers"] == 2


def test_create_order_idempotent_replay(client):
    tokens = _verified_user(client, 1302)
    headers = _auth_header(tokens)
    body = _base_body()
    r1 = client.post("/v1/orders", headers=headers, json=body)
    r2 = client.post("/v1/orders", headers=headers, json=body)
    assert r1.status_code == 201
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]


def test_create_order_lead_time_too_short(client):
    tokens = _verified_user(client, 1303)
    r = client.post(
        "/v1/orders",
        headers=_auth_header(tokens),
        json=_base_body(scheduled_at=_future_iso(days=0, hours=0)),
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "LEAD_TIME_TOO_SHORT"


def test_create_order_out_of_horizon(client):
    tokens = _verified_user(client, 1304)
    r = client.post(
        "/v1/orders",
        headers=_auth_header(tokens),
        json=_base_body(scheduled_at=_future_iso(days=30)),
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "OUT_OF_HORIZON"


def test_unverified_user_cannot_create_order(client):
    tokens = _login(client, 1305)  # status stays 'pending'
    r = client.post("/v1/orders", headers=_auth_header(tokens), json=_base_body())
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "NOT_VERIFIED"


def test_list_upcoming_and_history(client):
    tokens = _verified_user(client, 1306)
    headers = _auth_header(tokens)
    client.post("/v1/orders", headers=headers, json=_base_body())

    r = client.get("/v1/orders?scope=upcoming", headers=headers)
    assert len(r.json()) == 1
    r = client.get("/v1/orders?scope=history", headers=headers)
    assert r.json() == []


def test_update_order_comment_and_passengers(client):
    tokens = _verified_user(client, 1307)
    headers = _auth_header(tokens)
    order = client.post("/v1/orders", headers=headers, json=_base_body()).json()

    r = client.patch(
        f"/v1/orders/{order['id']}", headers=headers, json={"comment": "hi", "passengers": 3}
    )
    assert r.status_code == 200
    assert r.json()["comment"] == "hi"
    assert r.json()["passengers"] == 3


def test_cancel_order_then_cannot_cancel_again(client):
    tokens = _verified_user(client, 1308)
    headers = _auth_header(tokens)
    order = client.post("/v1/orders", headers=headers, json=_base_body()).json()

    r = client.post(
        f"/v1/orders/{order['id']}/cancel", headers=headers, json={"reason": "changed my mind"}
    )
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled_by_user"

    r = client.post(f"/v1/orders/{order['id']}/cancel", headers=headers, json={})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "INVALID_TRANSITION"


def test_slot_conflict_on_overlapping_driver_booking(client):
    tokens = _verified_user(client, 1309)
    headers = _auth_header(tokens)
    driver_id = _make_driver(client, 1310)

    scheduled_at = _future_iso(days=2)
    r1 = client.post(
        "/v1/orders",
        headers=headers,
        json=_base_body(scheduled_at=scheduled_at, driver_id=driver_id),
    )
    assert r1.status_code == 201

    r2 = client.post(
        "/v1/orders",
        headers=headers,
        json=_base_body(
            scheduled_at=scheduled_at, driver_id=driver_id, from_address="другой адрес"
        ),
    )
    assert r2.status_code == 409
    assert r2.json()["error"]["code"] == "SLOT_CONFLICT"


def test_get_order_forbidden_for_other_user(client):
    tokens_a = _verified_user(client, 1311)
    tokens_b = _verified_user(client, 1312)
    order = client.post("/v1/orders", headers=_auth_header(tokens_a), json=_base_body()).json()

    r = client.get(f"/v1/orders/{order['id']}", headers=_auth_header(tokens_b))
    assert r.status_code == 403
