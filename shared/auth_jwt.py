from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt

from shared.config import get_settings
from shared.redis_client import get_redis

ALGORITHM = "HS256"


class TokenError(Exception):
    """Base for all token validation failures."""


class TokenInvalid(TokenError):
    pass


class TokenExpired(TokenError):
    pass


class TokenRevoked(TokenError):
    pass


def _encode(user, token_type: Literal["access", "refresh"], ttl: timedelta) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "type": token_type,
        "jti": uuid.uuid4().hex,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def create_access_token(user) -> str:
    settings = get_settings()
    return _encode(user, "access", timedelta(minutes=settings.JWT_ACCESS_TTL_MIN))


def create_refresh_token(user) -> str:
    settings = get_settings()
    return _encode(user, "refresh", timedelta(days=settings.JWT_REFRESH_TTL_DAYS))


async def decode_token(token: str, expected_type: Literal["access", "refresh"]) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as e:
        raise TokenExpired("token expired") from e
    except jwt.InvalidTokenError as e:
        raise TokenInvalid("token invalid") from e

    if payload.get("type") != expected_type:
        raise TokenInvalid(f"expected a {expected_type} token")

    redis = get_redis()

    if await redis.exists(f"jwt:blklist:{payload['jti']}"):
        raise TokenRevoked("token revoked")

    valid_after = await redis.get(f"jwt:valid_after:{payload['sub']}")
    if valid_after is not None and payload["iat"] < int(valid_after):
        raise TokenRevoked("all sessions revoked for this user")

    return payload


async def revoke_token(payload: dict[str, Any]) -> None:
    """Blocklist a single jti until its natural expiry (logout, or burning
    the just-used refresh token on rotation)."""
    redis = get_redis()
    remaining = payload["exp"] - int(datetime.now(UTC).timestamp())
    if remaining > 0:
        await redis.set(f"jwt:blklist:{payload['jti']}", "1", ex=remaining)


async def revoke_all_sessions(user_id: uuid.UUID) -> None:
    """Kills every access/refresh token issued before now for this user —
    used when an admin blocks/rejects them. TTL matches the longest-lived
    token type (refresh) so the marker doesn't need manual cleanup."""
    settings = get_settings()
    redis = get_redis()
    now = int(datetime.now(UTC).timestamp())
    await redis.set(
        f"jwt:valid_after:{user_id}",
        now,
        ex=int(timedelta(days=settings.JWT_REFRESH_TTL_DAYS).total_seconds()),
    )
