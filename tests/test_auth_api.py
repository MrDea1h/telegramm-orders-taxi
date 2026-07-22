import re

import pytest


def _extract_code(captured_emails: list[dict]) -> str:
    match = re.search(r"\b(\d{6})\b", captured_emails[-1]["body"])
    assert match, f"no 6-digit code found in email body: {captured_emails[-1]['body']}"
    return match.group(1)


async def _mark_verified(email: str) -> None:
    # Lazy imports: shared.db.engine builds its async engine from
    # DATABASE_URL at import time, which must happen after conftest's
    # database_url fixture has already set that env var (module-level
    # imports here would run at pytest collection time, too early).
    from sqlalchemy import select

    from shared.db.engine import get_sessionmaker
    from shared.db.models import User

    async with get_sessionmaker()() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one()
        user.status = "verified"
        await session.commit()


def test_register_verify_login_full_flow(client, captured_emails):
    r = client.post(
        "/v1/auth/register",
        json={"email": "anna@example.com", "password": "correcthorse123", "full_name": "Anna K"},
    )
    assert r.status_code == 202
    assert r.json() == {"status": "pending_verification"}
    code = _extract_code(captured_emails)

    r = client.post("/v1/auth/verify-email", json={"email": "anna@example.com", "code": "000000"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "CODE_INVALID"

    r = client.post("/v1/auth/verify-email", json={"email": "anna@example.com", "code": code})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["status"] == "pending"
    assert body["user"]["email_confirmed_at"] is not None

    r = client.post(
        "/v1/auth/login", json={"email": "anna@example.com", "password": "correcthorse123"}
    )
    assert r.status_code == 200
    assert r.json()["user"]["status"] == "pending"

    import asyncio

    asyncio.run(_mark_verified("anna@example.com"))

    r = client.post(
        "/v1/auth/login", json={"email": "anna@example.com", "password": "correcthorse123"}
    )
    assert r.status_code == 200
    assert r.json()["user"]["status"] == "verified"


def test_verify_email_too_many_attempts(client, captured_emails):
    client.post(
        "/v1/auth/register",
        json={"email": "bob@example.com", "password": "correcthorse123", "full_name": "Bob"},
    )
    for _ in range(5):
        r = client.post(
            "/v1/auth/verify-email", json={"email": "bob@example.com", "code": "000000"}
        )
        assert r.status_code == 400

    r = client.post("/v1/auth/verify-email", json={"email": "bob@example.com", "code": "000000"})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "CODE_TOO_MANY_ATTEMPTS"


def test_login_unknown_email_and_wrong_password(client, captured_emails):
    client.post(
        "/v1/auth/register",
        json={"email": "carl@example.com", "password": "correcthorse123", "full_name": "Carl"},
    )
    code = _extract_code(captured_emails)
    client.post("/v1/auth/verify-email", json={"email": "carl@example.com", "code": code})

    r = client.post(
        "/v1/auth/login", json={"email": "nobody@example.com", "password": "whatever123"}
    )
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_CREDENTIALS"

    r = client.post("/v1/auth/login", json={"email": "carl@example.com", "password": "wrong123"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_before_email_confirmed_rejected(client, captured_emails):
    client.post(
        "/v1/auth/register",
        json={"email": "dana@example.com", "password": "correcthorse123", "full_name": "Dana"},
    )
    r = client.post(
        "/v1/auth/login", json={"email": "dana@example.com", "password": "correcthorse123"}
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "EMAIL_NOT_CONFIRMED"


def test_refresh_rotation_and_logout(client, captured_emails):
    client.post(
        "/v1/auth/register",
        json={"email": "erin@example.com", "password": "correcthorse123", "full_name": "Erin"},
    )
    code = _extract_code(captured_emails)
    tokens = client.post(
        "/v1/auth/verify-email", json={"email": "erin@example.com", "code": code}
    ).json()

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


@pytest.mark.parametrize("password", ["short"])
def test_register_rejects_short_password(client, password):
    r = client.post(
        "/v1/auth/register",
        json={"email": "short@example.com", "password": password, "full_name": "Short"},
    )
    assert r.status_code == 422
