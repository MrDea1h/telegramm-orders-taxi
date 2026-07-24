import asyncio
import datetime as dt
import hashlib
import hmac
import time
import uuid
from zoneinfo import ZoneInfo

BOT_TOKEN = "123456:test-bot-token"
ADMIN_TELEGRAM_ID = 900301
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
    # Bookings are Monday-Friday only (api/app/orders_api.py's _is_weekend)
    # — nudge forward a day at a time until the requested offset lands on a
    # weekday in COMPANY_TZ, so this fixture stays valid no matter what day
    # the test suite happens to run on. Only for days >= 1: the days=0
    # "right now" case is used to test the LEAD_TIME_TOO_SHORT rejection
    # itself, which must fire regardless of weekday and must NOT be nudged
    # forward into becoming an accidentally-valid time.
    candidate = dt.datetime.now(dt.UTC) + dt.timedelta(days=days, hours=hours)
    if days >= 1:
        while candidate.astimezone(_COMPANY_TZ).weekday() >= 5:
            candidate += dt.timedelta(days=1)
    return candidate.isoformat()


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


def test_slots_reflect_real_transit_time_from_previous_dropoff(client, monkeypatch):
    admin_token = _admin_token(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    driver_tokens = _login(client, 1330, "Driver")
    driver_user_id = driver_tokens["user"]["id"]
    r = client.patch(
        f"/v1/admin/users/{driver_user_id}/role", headers=admin_headers, json={"role": "driver"}
    )
    assert r.status_code == 200
    r = client.post(
        f"/v1/admin/verification-requests/{driver_user_id}/approve", headers=admin_headers
    )
    assert r.status_code == 200
    driver_id = asyncio.run(_get_driver_id(driver_user_id))
    driver_headers = _auth_header(driver_tokens)

    # Fixed at 10:00 local rather than "whatever time of day _future_iso
    # lands on" — the test needs reliable room both before AND after this
    # booking within the day's schedule window, which a wall-clock-relative
    # time can't guarantee (e.g. landing at 23:00 would leave no room after).
    next_weekday_local = dt.datetime.now(_COMPANY_TZ) + dt.timedelta(days=1)
    while next_weekday_local.weekday() >= 5:
        next_weekday_local += dt.timedelta(days=1)
    order_time = next_weekday_local.replace(hour=10, minute=0, second=0, microsecond=0)
    weekday = order_time.weekday()
    r = client.put(
        "/v1/drivers/me/schedule",
        headers=driver_headers,
        json=[{"weekday": weekday, "start_time": "00:00:00", "end_time": "23:30:00"}],
    )
    assert r.status_code == 200

    user_tokens = _verified_user(client, 1331)
    r = client.post(
        "/v1/orders",
        headers=_auth_header(user_tokens),
        json=_base_body(
            scheduled_at=order_time.isoformat(),
            driver_id=driver_id,
            to_lat=55.0,
            to_lon=37.0,
            est_duration_min=30,
        ),
    )
    assert r.status_code == 201

    async def fake_route_eta_seconds(from_lat, from_lon, to_lat, to_lon):
        return 3600.0, 20000.0  # 60 real minutes — far more than ORDER_BUFFER_MIN

    monkeypatch.setattr("api.app.orders_api.ors_route_eta_seconds", fake_route_eta_seconds)

    date_str = order_time.astimezone(_COMPANY_TZ).date().isoformat()
    r = client.get(
        "/v1/orders/slots",
        headers=_auth_header(user_tokens),
        params={
            "date": date_str,
            "driver_id": driver_id,
            "duration_min": 30,
            "from_lat": 60.0,
            "from_lon": 40.0,
        },
    )
    assert r.status_code == 200
    times = [dt.datetime.fromisoformat(s["time"]) for s in r.json()["slots"] if s["available"]]

    # The all-day schedule legitimately offers slots before the existing
    # booking too (whatever time of day _future_iso(1) landed on) — only the
    # slots that would fall in the gap right after it are what this test is
    # actually about.
    order_end = order_time + dt.timedelta(minutes=30)
    after_order_times = [t for t in times if t >= order_end]
    assert after_order_times, "expected at least one slot after the existing booking"

    # With the real 60-minute transit time (+ORDER_REAL_TRANSIT_MARGIN_MIN=10
    # safety margin on top, see _real_gap_min), nothing should be offered
    # until order_end + 70 real minutes — a flat ORDER_BUFFER_MIN(30) buffer
    # would have wrongly allowed slots starting as early as order_end+30min.
    too_early_cutoff = order_end + dt.timedelta(minutes=70)
    assert all(t >= too_early_cutoff for t in after_order_times), [
        t.isoformat() for t in after_order_times
    ]
    # Confirm slots do reopen right at/after that real cutoff — an all-empty
    # list would vacuously satisfy the assertion above without proving
    # anything.
    assert any(
        too_early_cutoff <= t < too_early_cutoff + dt.timedelta(minutes=45)
        for t in after_order_times
    ), [t.isoformat() for t in after_order_times]


def test_taken_slot_appears_disabled_not_omitted(client):
    admin_token = _admin_token(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    driver_tokens = _login(client, 1350, "Driver")
    driver_user_id = driver_tokens["user"]["id"]
    r = client.patch(
        f"/v1/admin/users/{driver_user_id}/role", headers=admin_headers, json={"role": "driver"}
    )
    assert r.status_code == 200
    r = client.post(
        f"/v1/admin/verification-requests/{driver_user_id}/approve", headers=admin_headers
    )
    assert r.status_code == 200
    driver_id = asyncio.run(_get_driver_id(driver_user_id))
    driver_headers = _auth_header(driver_tokens)

    next_weekday_local = dt.datetime.now(_COMPANY_TZ) + dt.timedelta(days=1)
    while next_weekday_local.weekday() >= 5:
        next_weekday_local += dt.timedelta(days=1)
    order_time = next_weekday_local.replace(hour=10, minute=0, second=0, microsecond=0)
    weekday = order_time.weekday()
    r = client.put(
        "/v1/drivers/me/schedule",
        headers=driver_headers,
        json=[{"weekday": weekday, "start_time": "09:00:00", "end_time": "12:00:00"}],
    )
    assert r.status_code == 200

    user_tokens = _verified_user(client, 1351)
    r = client.post(
        "/v1/orders",
        headers=_auth_header(user_tokens),
        json=_base_body(
            scheduled_at=order_time.isoformat(), driver_id=driver_id, est_duration_min=30
        ),
    )
    assert r.status_code == 201

    date_str = order_time.astimezone(_COMPANY_TZ).date().isoformat()
    r = client.get(
        "/v1/orders/slots",
        headers=_auth_header(user_tokens),
        params={"date": date_str, "driver_id": driver_id, "duration_min": 30},
    )
    assert r.status_code == 200
    slots = r.json()["slots"]

    taken = next((s for s in slots if dt.datetime.fromisoformat(s["time"]) == order_time), None)
    assert taken is not None, "the booked slot should still appear in the grid, just disabled"
    assert taken["available"] is False

    free = [
        s for s in slots if s["available"] and dt.datetime.fromisoformat(s["time"]) != order_time
    ]
    assert free, "expected at least one still-free slot elsewhere in the same window"


def test_create_round_trip_order_defaults_and_respects_wait_time(client):
    tokens = _verified_user(client, 1360)
    headers = _auth_header(tokens)

    r = client.post(
        "/v1/orders",
        headers=headers,
        json=_base_body(is_round_trip=True, est_duration_min=75),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["is_round_trip"] is True
    assert body["wait_time_min"] == 15  # default when omitted

    r = client.post(
        "/v1/orders",
        headers=headers,
        json=_base_body(is_round_trip=True, wait_time_min=25, est_duration_min=90),
    )
    assert r.status_code == 201
    assert r.json()["wait_time_min"] == 25

    r = client.post("/v1/orders", headers=headers, json=_base_body())
    assert r.status_code == 201
    body = r.json()
    assert body["is_round_trip"] is False
    assert body["wait_time_min"] is None


def test_round_trip_booking_uses_origin_as_effective_dropoff_for_next_gap(client, monkeypatch):
    # A round trip ends back at from_address (the driver waits, then
    # returns), not to_address — the gap check against the NEXT booking
    # must reflect that. Mock ORS with two very different transit times
    # for "from A" vs "from B" to C, so using the wrong reference point
    # would produce a visibly different (and wrong) cutoff.
    admin_token = _admin_token(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    driver_tokens = _login(client, 1361, "Driver")
    driver_user_id = driver_tokens["user"]["id"]
    r = client.patch(
        f"/v1/admin/users/{driver_user_id}/role", headers=admin_headers, json={"role": "driver"}
    )
    assert r.status_code == 200
    r = client.post(
        f"/v1/admin/verification-requests/{driver_user_id}/approve", headers=admin_headers
    )
    assert r.status_code == 200
    driver_id = asyncio.run(_get_driver_id(driver_user_id))
    driver_headers = _auth_header(driver_tokens)

    next_weekday_local = dt.datetime.now(_COMPANY_TZ) + dt.timedelta(days=1)
    while next_weekday_local.weekday() >= 5:
        next_weekday_local += dt.timedelta(days=1)
    order_time = next_weekday_local.replace(hour=11, minute=0, second=0, microsecond=0)
    weekday = order_time.weekday()
    r = client.put(
        "/v1/drivers/me/schedule",
        headers=driver_headers,
        json=[{"weekday": weekday, "start_time": "00:00:00", "end_time": "23:30:00"}],
    )
    assert r.status_code == 200

    a_lat, a_lon = 10.0, 10.0
    b_lat, b_lon = 20.0, 20.0
    c_lat, c_lon = 30.0, 30.0

    user_tokens = _verified_user(client, 1362)
    r = client.post(
        "/v1/orders",
        headers=_auth_header(user_tokens),
        json=_base_body(
            scheduled_at=order_time.isoformat(),
            driver_id=driver_id,
            from_lat=a_lat,
            from_lon=a_lon,
            to_lat=b_lat,
            to_lon=b_lon,
            est_duration_min=60,
            is_round_trip=True,
            wait_time_min=20,
        ),
    )
    assert r.status_code == 201

    async def fake_route_eta_seconds(from_lat, from_lon, to_lat, to_lon):
        if (from_lat, from_lon, to_lat, to_lon) == (a_lat, a_lon, c_lat, c_lon):
            return 2400.0, 10000.0  # A -> C = 40 real minutes
        raise AssertionError(
            f"unexpected ORS call {from_lat},{from_lon} -> {to_lat},{to_lon} "
            "(should only ever check from the round trip's origin A, never B)"
        )

    monkeypatch.setattr("api.app.orders_api.ors_route_eta_seconds", fake_route_eta_seconds)

    date_str = order_time.astimezone(_COMPANY_TZ).date().isoformat()
    r = client.get(
        "/v1/orders/slots",
        headers=_auth_header(user_tokens),
        params={
            "date": date_str,
            "driver_id": driver_id,
            "duration_min": 20,
            "from_lat": c_lat,
            "from_lon": c_lon,
        },
    )
    assert r.status_code == 200
    local_times = {
        dt.datetime.fromisoformat(s["time"]).astimezone(_COMPANY_TZ).strftime("%H:%M")
        for s in r.json()["slots"]
        if s["available"]
    }

    # busy_end = order_time(11:00) + est_duration_min(60) + gap_after(40+10
    # margin=50) = 12:50 -> first free 30min-grid slot is 13:00 (12:30 still
    # overlaps). If the code wrongly used B as the effective dropoff, the
    # mocked ORS call itself would have raised (only A->C is allowed above).
    assert "12:30" not in local_times, sorted(local_times)
    assert "13:00" in local_times, sorted(local_times)


def test_slots_bidirectional_gap_matches_worked_example(client, monkeypatch):
    # Mirrors a user-supplied worked example exactly: a driver already has a
    # booking 11:00-12:00 from A to B. A new candidate ride goes from C to D
    # (duration 20min). Real transit: C->D=20min (the ride itself, not
    # exercised here), D->A=40min, B->C=60min. With a 10min safety margin on
    # top of real transit (ORDER_REAL_TRANSIT_MARGIN_MIN), the only legal
    # candidate windows are ones ending by 10:10 (11:00 - 40min transit -
    # 10min margin) or starting at/after 13:10 (12:00 + 60min transit +
    # 10min margin) — this asserts the 30min slot grid produces exactly
    # that shape (last "before" slot 09:30, first "after" slot 13:30).
    admin_token = _admin_token(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    driver_tokens = _login(client, 1340, "Driver")
    driver_user_id = driver_tokens["user"]["id"]
    r = client.patch(
        f"/v1/admin/users/{driver_user_id}/role", headers=admin_headers, json={"role": "driver"}
    )
    assert r.status_code == 200
    r = client.post(
        f"/v1/admin/verification-requests/{driver_user_id}/approve", headers=admin_headers
    )
    assert r.status_code == 200
    driver_id = asyncio.run(_get_driver_id(driver_user_id))
    driver_headers = _auth_header(driver_tokens)

    next_weekday_local = dt.datetime.now(_COMPANY_TZ) + dt.timedelta(days=1)
    while next_weekday_local.weekday() >= 5:
        next_weekday_local += dt.timedelta(days=1)
    order_time = next_weekday_local.replace(hour=11, minute=0, second=0, microsecond=0)
    weekday = order_time.weekday()
    r = client.put(
        "/v1/drivers/me/schedule",
        headers=driver_headers,
        json=[{"weekday": weekday, "start_time": "00:00:00", "end_time": "23:30:00"}],
    )
    assert r.status_code == 200

    a_lat, a_lon = 10.0, 10.0
    b_lat, b_lon = 20.0, 20.0
    c_lat, c_lon = 30.0, 30.0
    d_lat, d_lon = 40.0, 40.0

    user_tokens = _verified_user(client, 1341)
    r = client.post(
        "/v1/orders",
        headers=_auth_header(user_tokens),
        json=_base_body(
            scheduled_at=order_time.isoformat(),
            driver_id=driver_id,
            from_lat=a_lat,
            from_lon=a_lon,
            to_lat=b_lat,
            to_lon=b_lon,
            est_duration_min=60,
        ),
    )
    assert r.status_code == 201

    async def fake_route_eta_seconds(from_lat, from_lon, to_lat, to_lon):
        if (from_lat, from_lon, to_lat, to_lon) == (d_lat, d_lon, a_lat, a_lon):
            return 2400.0, 10000.0  # D -> A = 40 real minutes
        if (from_lat, from_lon, to_lat, to_lon) == (b_lat, b_lon, c_lat, c_lon):
            return 3600.0, 10000.0  # B -> C = 60 real minutes
        raise AssertionError(f"unexpected ORS call {from_lat},{from_lon} -> {to_lat},{to_lon}")

    monkeypatch.setattr("api.app.orders_api.ors_route_eta_seconds", fake_route_eta_seconds)

    date_str = order_time.astimezone(_COMPANY_TZ).date().isoformat()
    r = client.get(
        "/v1/orders/slots",
        headers=_auth_header(user_tokens),
        params={
            "date": date_str,
            "driver_id": driver_id,
            "duration_min": 20,
            "from_lat": c_lat,
            "from_lon": c_lon,
            "to_lat": d_lat,
            "to_lon": d_lon,
        },
    )
    assert r.status_code == 200
    times = [dt.datetime.fromisoformat(s["time"]) for s in r.json()["slots"] if s["available"]]
    local_times = {t.astimezone(_COMPANY_TZ).strftime("%H:%M") for t in times}

    # Last legal "before" slot: 09:30 (ends 09:50, safely inside the 10:10
    # cutoff); 10:00 would end at 10:20, past the cutoff — must be excluded.
    assert "09:30" in local_times, sorted(local_times)
    assert "10:00" not in local_times, sorted(local_times)

    # First legal "after" slot: 13:30 (>= 13:10 cutoff); 13:00 is too early.
    assert "13:00" not in local_times, sorted(local_times)
    assert "13:30" in local_times, sorted(local_times)


def test_get_order_forbidden_for_other_user(client):
    tokens_a = _verified_user(client, 1311)
    tokens_b = _verified_user(client, 1312)
    order = client.post("/v1/orders", headers=_auth_header(tokens_a), json=_base_body()).json()

    r = client.get(f"/v1/orders/{order['id']}", headers=_auth_header(tokens_b))
    assert r.status_code == 403
