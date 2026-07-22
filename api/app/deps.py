import uuid
from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from api.app.errors import AppError
from shared.auth_jwt import TokenError, decode_token
from shared.db.engine import get_session
from shared.db.models import User

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    if credentials is None:
        raise AppError(401, "UNAUTHORIZED", "Missing bearer token")

    try:
        payload = await decode_token(credentials.credentials, "access")
    except TokenError as e:
        raise AppError(401, "UNAUTHORIZED", str(e)) from e

    user = await session.get(User, uuid.UUID(payload["sub"]))
    if user is None:
        raise AppError(401, "UNAUTHORIZED", "User not found")
    if user.status == "blocked":
        # Kills a session immediately once an admin blocks the user, not
        # just at their next login attempt.
        raise AppError(401, "UNAUTHORIZED", "Account is blocked")

    return user


def require_role(*roles: str) -> Callable[..., Coroutine[Any, Any, User]]:
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise AppError(403, "FORBIDDEN", "Insufficient role")
        return user

    return _dep


async def require_verified(user: User = Depends(get_current_user)) -> User:
    """Unused until M3's order endpoints depend on it — defined now since
    it's free and avoids a later gap."""
    if user.status != "verified":
        raise AppError(403, "NOT_VERIFIED", "Account is not yet verified by an admin")
    return user
