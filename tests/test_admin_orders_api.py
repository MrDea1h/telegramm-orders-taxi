import asyncio
import datetime as dt
import hashlib
import hmac
import time
import uuid
from zoneinfo import ZoneInfo

BOT_TOKEN = "123456:test-bot-token"
ADMIN_TELEGRAM_ID = 900501
_COMPANY_TZ = ZoneInfo("Europe/Moscow")


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


async def _get_event_payload(event_type: str) -> dict:
    from sqlalchemy import select

    from shared.db.engine import get_sessionmaker
    from shared.db.models import OrderEvent

    async with get_sessionmaker()() as session:
        event = (
            (
                await session.execute(
                    select(OrderEvent)
                    .where(OrderEvent.event_type == event_type)
                    .order_by(OrderEvent.created_at.desc())
                )
            )
            .scalars()
            .first()
        )
        return event.payload


def _verified_user(client, telegram_id: int) -> dict:
    tokens = _login(client, telegram_id)
    asyncio.run(_verify(telegram_id))
    return tokens


def _admin_token(client) -> str:
    asyncio.run(_create_admin(ADMIN_TELEGRAM_ID))
    return _login(client, ADMIN_TELEGRAM_ID, "Admin")["access_token"]


def _make_driver(client, telegram_id: int, admin_token: str) -> dict:
    tokens = _login(client, telegram_id, "Driver")
    user_id = tokens["user"]["id"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    r = client.patch(
        f"/v1/admin/users/{user_id}/role", headers=admin_headers, json={"role": "driver"}
    )
    assert r.status_code == 200
    r = client.post(f"/v1/admin/verification-requests/{user_id}/approve", headers=admin_headers)
    assert r.status_code == 200
    return tokens


def _create_order(client, tokens: dict, driver_id: str | None = None) -> dict:
    # Bookings are Monday-Friday only (api/app/orders_api.py's _is_weekend)
    # — nudge forward until this lands on a weekday in COMPANY_TZ, so this
    # fixture stays valid no matter what day the suite happens to run on.
    candidate = dt.datetime.now(dt.UTC) + dt.timedelta(days=2)
    while candidate.astimezone(_COMPANY_TZ).weekday() >= 5:
        candidate += dt.timedelta(days=1)
    scheduled_at = candidate.isoformat()
    body = {
        "idempotency_key": str(uuid.uuid4()),
        "from_address": "A",
        "to_address": "B",
        "scheduled_at": scheduled_at,
        "driver_id": driver_id,
    }
    r = client.post("/v1/orders", headers=_auth_header(tokens), json=body)
    assert r.status_code == 201
    return r.json()


def test_non_admin_gets_403(client):
    tokens = _verified_user(client, 1501)
    r = client.get("/v1/admin/orders", headers=_auth_header(tokens))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"


def test_list_admin_orders_with_status_filter(client):
    admin_token = _admin_token(client)
    user_tokens = _verified_user(client, 1502)
    order = _create_order(client, user_tokens)

    r = client.get(
        "/v1/admin/orders?status=pending_driver",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    ids = [o["id"] for o in r.json()]
    assert order["id"] in ids
    assert all(o["status"] == "pending_driver" for o in r.json())
    # user contact info is joined in for the admin view (present as keys,
    # even though this test user never filled in a name/phone)
    matched = next(o for o in r.json() if o["id"] == order["id"])
    assert "user_full_name" in matched
    assert "user_phone" in matched


def test_assign_order_to_driver(client):
    admin_token = _admin_token(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    user_tokens = _verified_user(client, 1503)
    driver_tokens = _make_driver(client, 1504, admin_token)
    driver_id = asyncio.run(_get_driver_id(driver_tokens["user"]["id"]))
    order = _create_order(client, user_tokens)

    r = client.patch(
        f"/v1/admin/orders/{order['id']}/assign",
        headers=admin_headers,
        json={"driver_id": driver_id},
    )
    assert r.status_code == 200
    assert r.json()["driver_id"] == driver_id

    payload = asyncio.run(_get_event_payload("admin_reassigned"))
    assert payload["to_driver_id"] == driver_id


def test_admin_forced_cancel(client):
    admin_token = _admin_token(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    user_tokens = _verified_user(client, 1505)
    order = _create_order(client, user_tokens)

    r = client.post(
        f"/v1/admin/orders/{order['id']}/cancel", headers=admin_headers, json={"reason": "policy"}
    )
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled_by_admin"

    payload = asyncio.run(_get_event_payload("cancelled_by_admin"))
    assert payload["reason"] == "policy"
    assert payload["previous_status"] == "pending_driver"

    r = client.post(
        f"/v1/admin/orders/{order['id']}/cancel", headers=admin_headers, json={"reason": "again"}
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "INVALID_TRANSITION"
