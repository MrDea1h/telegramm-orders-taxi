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


def _login(client, telegram_id: int) -> dict:
    payload = _sign_login_widget(
        {"id": str(telegram_id), "first_name": "User", "auth_date": str(int(time.time()))}
    )
    r = client.post("/v1/auth/telegram/login-widget", json=payload)
    assert r.status_code == 200
    return r.json()


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


def _verified_headers(client, telegram_id: int) -> dict:
    import asyncio

    tokens = _login(client, telegram_id)
    asyncio.run(_verify(telegram_id))
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_eta_falls_back_to_haversine_without_ors_key(client):
    # ORS_API_KEY is unset in the test environment by default.
    headers = _verified_headers(client, 1201)
    r = client.post(
        "/v1/routing/eta",
        headers=headers,
        json={"from_lat": 55.751, "from_lon": 37.618, "to_lat": 55.760, "to_lon": 37.640},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "fallback"
    assert body["is_estimated"] is True
    assert body["distance_km"] > 0
    assert body["duration_min"] > 0


def test_eta_unresolvable_address_returns_422(client):
    headers = _verified_headers(client, 1202)
    r = client.post(
        "/v1/routing/eta",
        headers=headers,
        json={"from_address": "somewhere with no coords", "to_lat": 55.76, "to_lon": 37.64},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "ADDRESS_NOT_RESOLVED"


def test_eta_missing_endpoint_is_422_validation_error(client):
    headers = _verified_headers(client, 1203)
    r = client.post("/v1/routing/eta", headers=headers, json={"to_lat": 55.76, "to_lon": 37.64})
    assert r.status_code == 422


def test_eta_uses_real_routing_when_ors_call_succeeds(client, monkeypatch):
    async def fake_route_eta_seconds(from_lat, from_lon, to_lat, to_lon):
        return 900.0, 5000.0  # 15 real minutes, 5 real km

    monkeypatch.setattr("api.app.routing_api.ors_route_eta_seconds", fake_route_eta_seconds)

    headers = _verified_headers(client, 1204)
    r = client.post(
        "/v1/routing/eta",
        headers=headers,
        json={"from_lat": 55.751, "from_lon": 37.618, "to_lat": 55.760, "to_lon": 37.640},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "real"
    assert body["is_estimated"] is False
    # No margin factor on the real-route branch (see routing_api.py) — 900s / 60 = 15 minutes
    assert body["duration_min"] == 15
    assert body["distance_km"] == 5.0
