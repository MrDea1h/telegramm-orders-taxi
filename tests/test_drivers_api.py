import hashlib
import hmac
import time

BOT_TOKEN = "123456:test-bot-token"
ADMIN_TELEGRAM_ID = 900101


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


async def _create_admin(telegram_id: int) -> None:
    from shared.db.engine import get_sessionmaker
    from shared.db.models import User

    async with get_sessionmaker()() as session:
        session.add(
            User(telegram_id=telegram_id, full_name="Admin", role="admin", status="verified")
        )
        await session.commit()


def _admin_token(client) -> str:
    import asyncio

    asyncio.run(_create_admin(ADMIN_TELEGRAM_ID))
    return _login(client, ADMIN_TELEGRAM_ID, "Admin")["access_token"]


def _make_driver(client, telegram_id: int) -> dict:
    """Logs in a fresh user, promotes them to role='driver' and approves
    their verification via the admin panel — the real self-serve flow —
    since most driver endpoints require both role='driver' and a verified
    account."""
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

    # No re-login needed: authorization always re-reads the live DB row
    # (see deps.py), never trusts role/status from the token's own claims.
    return tokens


def test_list_drivers_excludes_inactive(client):
    tokens = _make_driver(client, 1101)
    r = client.get("/v1/drivers", headers=_auth_header(tokens))
    assert r.status_code == 200
    assert any(d["full_name"] == "Driver" for d in r.json())


def test_schedule_replace_rejects_overlap(client):
    tokens = _make_driver(client, 1102)
    r = client.put(
        "/v1/drivers/me/schedule",
        headers=_auth_header(tokens),
        json=[
            {"weekday": 0, "start_time": "09:00:00", "end_time": "13:00:00"},
            {"weekday": 0, "start_time": "12:00:00", "end_time": "17:00:00"},
        ],
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "SCHEDULE_OVERLAP"


def test_schedule_replace_and_get(client):
    tokens = _make_driver(client, 1103)
    r = client.put(
        "/v1/drivers/me/schedule",
        headers=_auth_header(tokens),
        json=[{"weekday": 1, "start_time": "09:00:00", "end_time": "18:00:00"}],
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = client.get("/v1/drivers/me/schedule", headers=_auth_header(tokens))
    assert r.status_code == 200
    assert r.json()[0]["weekday"] == 1


def test_time_off_add_and_delete(client):
    tokens = _make_driver(client, 1104)
    r = client.post(
        "/v1/drivers/me/time-off",
        headers=_auth_header(tokens),
        json={
            "starts_at": "2026-09-01T00:00:00Z",
            "ends_at": "2026-09-05T00:00:00Z",
            "reason": "vacation",
        },
    )
    assert r.status_code == 201
    time_off_id = r.json()["id"]

    r = client.delete(f"/v1/drivers/me/time-off/{time_off_id}", headers=_auth_header(tokens))
    assert r.status_code == 204


def test_set_duty_toggle(client):
    tokens = _make_driver(client, 1105)
    r = client.patch("/v1/drivers/me/duty", headers=_auth_header(tokens), json={"on_duty": False})
    assert r.status_code == 200
    assert r.json()["on_duty"] is False


def test_non_driver_gets_403(client):
    tokens = _login(client, 1106)
    r = client.get("/v1/drivers/me/schedule", headers=_auth_header(tokens))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"


def test_admin_can_use_driver_endpoints_without_a_prior_driver_row(client):
    admin_token = _admin_token(client)
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Admin has no Driver row yet — driver-only endpoints auto-provision one
    # rather than 404ing, since admin is a superuser for every workflow.
    r = client.get("/v1/drivers/me/schedule", headers=headers)
    assert r.status_code == 200
    assert r.json() == []

    r = client.get("/v1/drivers/me", headers=headers)
    assert r.status_code == 200
    assert r.json()["on_duty"] is True
