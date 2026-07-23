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


def _auth_header(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_create_and_list_favorites(client):
    tokens = _login(client, 1001)
    r = client.post(
        "/v1/addresses",
        headers=_auth_header(tokens),
        json={
            "label": "Офис",
            "address_text": "ул. Ленина 1",
            "lat": 55.75,
            "lon": 37.6,
            "is_favorite": True,
        },
    )
    assert r.status_code == 201
    assert r.json()["is_favorite"] is True

    r = client.get("/v1/addresses?scope=favorites", headers=_auth_header(tokens))
    assert r.status_code == 200
    texts = [a["address_text"] for a in r.json()]
    assert texts == ["ул. Ленина 1"]

    r = client.get("/v1/addresses?scope=recent", headers=_auth_header(tokens))
    assert r.json() == []


def test_touch_creates_recent_and_updates_on_repeat(client):
    tokens = _login(client, 1002)
    r = client.post(
        "/v1/addresses/touch",
        headers=_auth_header(tokens),
        json={"address_text": "ул. Мира 5", "lat": 55.7, "lon": 37.5},
    )
    assert r.status_code == 200
    first_id = r.json()["id"]

    r = client.post(
        "/v1/addresses/touch",
        headers=_auth_header(tokens),
        json={"address_text": "ул. Мира 5", "lat": 55.71, "lon": 37.51},
    )
    assert r.status_code == 200
    assert r.json()["id"] == first_id
    assert r.json()["lat"] == 55.71

    r = client.get("/v1/addresses?scope=recent", headers=_auth_header(tokens))
    assert len(r.json()) == 1


def test_set_favorite_and_delete_owner_only(client):
    tokens_a = _login(client, 1003)
    tokens_b = _login(client, 1004)

    r = client.post(
        "/v1/addresses",
        headers=_auth_header(tokens_a),
        json={"address_text": "ул. Победы 10", "is_favorite": False},
    )
    address_id = r.json()["id"]

    r = client.patch(
        f"/v1/addresses/{address_id}/favorite",
        headers=_auth_header(tokens_b),
        json={"is_favorite": True},
    )
    assert r.status_code == 404

    r = client.patch(
        f"/v1/addresses/{address_id}/favorite",
        headers=_auth_header(tokens_a),
        json={"is_favorite": True},
    )
    assert r.status_code == 200
    assert r.json()["is_favorite"] is True

    r = client.delete(f"/v1/addresses/{address_id}", headers=_auth_header(tokens_b))
    assert r.status_code == 404

    r = client.delete(f"/v1/addresses/{address_id}", headers=_auth_header(tokens_a))
    assert r.status_code == 204


def test_create_without_coords_geocode_gracefully_returns_none(client):
    # YANDEX_API_KEY is unset in the test env, so geocode() short-circuits to
    # None without making any network call — the address still saves.
    tokens = _login(client, 1005)
    r = client.post(
        "/v1/addresses",
        headers=_auth_header(tokens),
        json={"address_text": "Неизвестный адрес без координат"},
    )
    assert r.status_code == 201
    assert r.json()["lat"] is None
    assert r.json()["lon"] is None
