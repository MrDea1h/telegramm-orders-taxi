import re


def _extract_code(captured_emails: list[dict]) -> str:
    match = re.search(r"\b(\d{6})\b", captured_emails[-1]["body"])
    assert match
    return match.group(1)


async def _create_admin(email: str, password: str) -> None:
    # Lazy imports: shared.db.engine builds its async engine from
    # DATABASE_URL at import time, which must happen after conftest's
    # database_url fixture has already set that env var.
    import datetime as dt

    from shared.auth_passwords import hash_password
    from shared.db.engine import get_sessionmaker
    from shared.db.models import User

    async with get_sessionmaker()() as session:
        session.add(
            User(
                email=email,
                password_hash=hash_password(password),
                full_name="Admin",
                role="admin",
                status="verified",
                email_confirmed_at=dt.datetime.now(dt.UTC),
            )
        )
        await session.commit()


async def _get_user_id(email: str) -> str:
    from sqlalchemy import select

    from shared.db.engine import get_sessionmaker
    from shared.db.models import User

    async with get_sessionmaker()() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one()
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


def _admin_token(client) -> str:
    import asyncio

    asyncio.run(_create_admin("admin@example.com", "adminpass123"))
    r = client.post(
        "/v1/auth/login", json={"email": "admin@example.com", "password": "adminpass123"}
    )
    assert r.status_code == 200
    return r.json()["access_token"]


def test_non_admin_gets_403(client, captured_emails):
    client.post(
        "/v1/auth/register",
        json={"email": "user@example.com", "password": "correcthorse123", "full_name": "User"},
    )
    code = _extract_code(captured_emails)
    tokens = client.post(
        "/v1/auth/verify-email", json={"email": "user@example.com", "code": code}
    ).json()

    r = client.get(
        "/v1/admin/verification-requests",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"


def test_unconfirmed_email_excluded_from_queue(client, captured_emails):
    admin_token = _admin_token(client)
    client.post(
        "/v1/auth/register",
        json={
            "email": "unconfirmed@example.com",
            "password": "correcthorse123",
            "full_name": "Unconfirmed",
        },
    )

    r = client.get(
        "/v1/admin/verification-requests", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert r.status_code == 200
    assert r.json() == []


def test_confirmed_email_and_telegram_users_included(client, captured_emails):
    admin_token = _admin_token(client)

    client.post(
        "/v1/auth/register",
        json={"email": "anna@example.com", "password": "correcthorse123", "full_name": "Anna"},
    )
    code = _extract_code(captured_emails)
    client.post("/v1/auth/verify-email", json={"email": "anna@example.com", "code": code})

    r = client.get(
        "/v1/admin/verification-requests", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()]
    assert emails == ["anna@example.com"]


def test_reject_writes_audit_and_blocks_login(client, captured_emails):
    import asyncio

    admin_token = _admin_token(client)

    client.post(
        "/v1/auth/register",
        json={"email": "pavel@example.com", "password": "correcthorse123", "full_name": "Pavel"},
    )
    code = _extract_code(captured_emails)
    client.post("/v1/auth/verify-email", json={"email": "pavel@example.com", "code": code})

    user_id = asyncio.run(_get_user_id("pavel@example.com"))

    r = client.post(
        f"/v1/admin/verification-requests/{user_id}/reject",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "could not verify"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "blocked"

    payload = asyncio.run(_get_event_payload("verification_rejected"))
    assert payload == {"reason": "could not verify"}

    r = client.post(
        "/v1/auth/login", json={"email": "pavel@example.com", "password": "correcthorse123"}
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "ACCOUNT_BLOCKED"


def test_approve_marks_verified(client, captured_emails):
    import asyncio

    admin_token = _admin_token(client)

    client.post(
        "/v1/auth/register",
        json={"email": "olga@example.com", "password": "correcthorse123", "full_name": "Olga"},
    )
    code = _extract_code(captured_emails)
    client.post("/v1/auth/verify-email", json={"email": "olga@example.com", "code": code})

    user_id = asyncio.run(_get_user_id("olga@example.com"))

    r = client.post(
        f"/v1/admin/verification-requests/{user_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "verified"

    r = client.post(
        "/v1/auth/login", json={"email": "olga@example.com", "password": "correcthorse123"}
    )
    assert r.json()["user"]["status"] == "verified"
