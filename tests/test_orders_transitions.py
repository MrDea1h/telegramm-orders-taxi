import asyncio
import datetime as dt
import hashlib
import hmac
import time
import uuid

BOT_TOKEN = "123456:test-bot-token"
ADMIN_TELEGRAM_ID = 900401


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


async def _create_admin_if_missing(telegram_id: int) -> None:
    from sqlalchemy import select

    from shared.db.engine import get_sessionmaker
    from shared.db.models import User

    async with get_sessionmaker()() as session:
        existing = (
            await session.execute(select(User).where(User.telegram_id == telegram_id))
        ).scalar_one_or_none()
        if existing is None:
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
    asyncio.run(_create_admin_if_missing(ADMIN_TELEGRAM_ID))
    return _login(client, ADMIN_TELEGRAM_ID, "Admin")["access_token"]


def _make_driver(client, telegram_id: int) -> tuple[dict, str]:
    """Returns (tokens, driver_id) — driver_id is the Driver row's own id,
    distinct from the user id, since orders reference drivers.id."""
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
    driver_id = asyncio.run(_get_driver_id(user_id))
    return tokens, driver_id


def _create_order(client, tokens: dict, driver_id: str | None = None) -> dict:
    scheduled_at = (dt.datetime.now(dt.UTC) + dt.timedelta(days=2)).isoformat()
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


def _transition(
    client,
    driver_tokens: dict,
    order_id: str,
    action: str,
    reason: str | None = None,
    proposed_scheduled_at: str | None = None,
):
    body = {"action": action}
    if reason is not None:
        body["reason"] = reason
    if proposed_scheduled_at is not None:
        body["proposed_scheduled_at"] = proposed_scheduled_at
    return client.post(
        f"/v1/orders/{order_id}/transition", headers=_auth_header(driver_tokens), json=body
    )


def test_full_accept_to_complete_chain(client):
    user_tokens = _verified_user(client, 1401)
    driver_tokens, _driver_id = _make_driver(client, 1402)
    order = _create_order(client, user_tokens)  # "any driver" order

    for action, expected_status in [
        ("accept", "confirmed"),
        ("depart", "driver_en_route"),
        ("arrive", "driver_arrived"),
        ("start", "in_progress"),
        ("complete", "completed"),
    ]:
        r = _transition(client, driver_tokens, order["id"], action)
        assert r.status_code == 200, r.json()
        assert r.json()["status"] == expected_status


def test_reject_requires_reason(client):
    user_tokens = _verified_user(client, 1403)
    driver_tokens, driver_id = _make_driver(client, 1404)
    # reject only makes sense for an order already assigned to this driver —
    # an "any driver" order is just left alone (never accepted), not rejected.
    order = _create_order(client, user_tokens, driver_id=driver_id)

    r = _transition(client, driver_tokens, order["id"], "reject")
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "REASON_REQUIRED"

    r = _transition(client, driver_tokens, order["id"], "reject", reason="too far")
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled_by_driver"


def test_illegal_transition_returns_409_with_current_status(client):
    user_tokens = _verified_user(client, 1405)
    driver_tokens, _driver_id = _make_driver(client, 1406)
    order = _create_order(client, user_tokens)

    # can't "depart" before accepting
    r = _transition(client, driver_tokens, order["id"], "depart")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "INVALID_TRANSITION"
    assert "pending_driver" in r.json()["error"]["message"]


def test_concurrent_accept_race_only_one_wins(client):
    user_tokens = _verified_user(client, 1407)
    driver_a, _ = _make_driver(client, 1408)
    driver_b, _ = _make_driver(client, 1409)
    order = _create_order(client, user_tokens)  # "any driver" order

    r1 = _transition(client, driver_a, order["id"], "accept")
    r2 = _transition(client, driver_b, order["id"], "accept")

    statuses = sorted([r1.status_code, r2.status_code])
    assert statuses == [200, 409]
    winner = r1 if r1.status_code == 200 else r2
    assert winner.json()["status"] == "confirmed"


def test_driver_cannot_transition_unassigned_order_of_another_driver(client):
    user_tokens = _verified_user(client, 1410)
    driver_a, _ = _make_driver(client, 1411)
    driver_b, _ = _make_driver(client, 1412)
    order = _create_order(client, user_tokens, driver_id=None)

    # driver_a accepts, becoming the assigned driver
    r = _transition(client, driver_a, order["id"], "accept")
    assert r.status_code == 200

    # driver_b (never assigned) can't advance it further
    r = _transition(client, driver_b, order["id"], "depart")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "INVALID_TRANSITION"


def test_admin_can_accept_and_advance_an_order_as_driver(client):
    # Admin is a superuser for every workflow, including driving — it should
    # be able to walk the driver transition chain with no prior Driver row.
    user_tokens = _verified_user(client, 1413)
    admin_token = _admin_token(client)
    admin_tokens = {"access_token": admin_token}
    order = _create_order(client, user_tokens)  # "any driver" order

    r = _transition(client, admin_tokens, order["id"], "accept")
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"

    r = _transition(client, admin_tokens, order["id"], "depart")
    assert r.status_code == 200
    assert r.json()["status"] == "driver_en_route"


def _future_iso(days: int) -> str:
    return (dt.datetime.now(dt.UTC) + dt.timedelta(days=days)).isoformat()


def test_propose_time_requires_a_specific_driver(client):
    user_tokens = _verified_user(client, 1414)
    driver_tokens, _driver_id = _make_driver(client, 1415)
    order = _create_order(client, user_tokens, driver_id=None)  # "any driver"

    r = _transition(
        client, driver_tokens, order["id"], "propose_time", proposed_scheduled_at=_future_iso(3)
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "INVALID_TRANSITION"


def test_propose_time_requires_the_field(client):
    user_tokens = _verified_user(client, 1416)
    driver_tokens, driver_id = _make_driver(client, 1417)
    order = _create_order(client, user_tokens, driver_id=driver_id)

    r = _transition(client, driver_tokens, order["id"], "propose_time")
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "PROPOSED_TIME_REQUIRED"


def test_employee_accepts_proposed_time(client):
    user_tokens = _verified_user(client, 1418)
    driver_tokens, driver_id = _make_driver(client, 1419)
    order = _create_order(client, user_tokens, driver_id=driver_id)
    new_time = _future_iso(3)

    r = _transition(
        client, driver_tokens, order["id"], "propose_time", proposed_scheduled_at=new_time
    )
    assert r.status_code == 200
    assert r.json()["status"] == "driver_countered"
    assert r.json()["proposed_scheduled_at"] is not None

    r = client.post(
        f"/v1/orders/{order['id']}/counter",
        headers=_auth_header(user_tokens),
        json={"accept": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "confirmed"
    assert body["proposed_scheduled_at"] is None
    assert body["scheduled_at"] == new_time or body["scheduled_at"].startswith(new_time[:19])


def test_employee_declines_proposed_time_cancels_order(client):
    user_tokens = _verified_user(client, 1420)
    driver_tokens, driver_id = _make_driver(client, 1421)
    order = _create_order(client, user_tokens, driver_id=driver_id)

    r = _transition(
        client, driver_tokens, order["id"], "propose_time", proposed_scheduled_at=_future_iso(3)
    )
    assert r.status_code == 200

    r = client.post(
        f"/v1/orders/{order['id']}/counter",
        headers=_auth_header(user_tokens),
        json={"accept": False},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled_by_user"

    # Only the order's own owner can respond, and only while awaiting one.
    r = client.post(
        f"/v1/orders/{order['id']}/counter",
        headers=_auth_header(user_tokens),
        json={"accept": True},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "INVALID_TRANSITION"


def test_counter_response_forbidden_for_other_user(client):
    user_tokens = _verified_user(client, 1422)
    other_tokens = _verified_user(client, 1423)
    driver_tokens, driver_id = _make_driver(client, 1424)
    order = _create_order(client, user_tokens, driver_id=driver_id)
    _transition(
        client, driver_tokens, order["id"], "propose_time", proposed_scheduled_at=_future_iso(3)
    )

    r = client.post(
        f"/v1/orders/{order['id']}/counter",
        headers=_auth_header(other_tokens),
        json={"accept": True},
    )
    assert r.status_code == 404
