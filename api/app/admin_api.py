from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.app.deps import require_role
from api.app.errors import AppError
from shared.auth_jwt import revoke_all_sessions
from shared.db.engine import get_session
from shared.db.models import Driver, User, UserEvent

router = APIRouter(prefix="/v1/admin", tags=["admin"])


class VerificationRequestOut(BaseModel):
    id: uuid.UUID
    full_name: str | None
    email: str | None
    phone: str | None
    telegram_id: int | None
    email_confirmed_at: dt.datetime | None
    created_at: dt.datetime


class RejectRequest(BaseModel):
    reason: str


class AdminUserOut(BaseModel):
    id: uuid.UUID
    full_name: str | None
    email: str | None
    phone: str | None
    telegram_id: int | None
    role: str
    status: str
    created_at: dt.datetime


class SetRoleRequest(BaseModel):
    role: Literal["user", "driver", "admin"]


@router.get("/verification-requests", response_model=list[VerificationRequestOut])
async def list_verification_requests(
    admin: User = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> list[User]:
    # Genuinely identity-proven pending users only: either they confirmed
    # mailbox ownership via the email code, or Telegram's own signature
    # already proved control of that account. A pending row with neither
    # (shouldn't normally exist, but defensively excluded) never appears.
    result = await session.execute(
        select(User)
        .where(User.status == "pending")
        .where(or_(User.email_confirmed_at.is_not(None), User.telegram_id.is_not(None)))
        .order_by(User.created_at)
    )
    return list(result.scalars().all())


@router.post("/verification-requests/{user_id}/approve")
async def approve_verification_request(
    user_id: uuid.UUID,
    admin: User = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await session.get(User, user_id)
    if user is None or user.status != "pending":
        raise AppError(404, "NOT_FOUND", "No pending verification request for this user")

    user.status = "verified"
    session.add(UserEvent(user_id=user.id, actor_id=admin.id, event_type="verification_approved"))
    await session.commit()
    return {"id": str(user.id), "status": user.status}


@router.post("/verification-requests/{user_id}/reject")
async def reject_verification_request(
    user_id: uuid.UUID,
    body: RejectRequest,
    admin: User = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await session.get(User, user_id)
    if user is None or user.status != "pending":
        raise AppError(404, "NOT_FOUND", "No pending verification request for this user")

    user.status = "blocked"
    session.add(
        UserEvent(
            user_id=user.id,
            actor_id=admin.id,
            event_type="verification_rejected",
            payload={"reason": body.reason},
        )
    )
    await session.commit()
    await revoke_all_sessions(user.id)
    return {"id": str(user.id), "status": user.status}


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(
    admin: User = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> list[User]:
    result = await session.execute(select(User).order_by(User.created_at.desc()))
    return list(result.scalars().all())


@router.patch("/users/{user_id}/role", response_model=AdminUserOut)
async def set_user_role(
    user_id: uuid.UUID,
    body: SetRoleRequest,
    admin: User = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise AppError(404, "NOT_FOUND", "User not found")

    if user.id == admin.id and body.role != "admin":
        # This is currently the only self-serve way to assign roles at all —
        # an admin demoting themselves would have no way back short of a
        # direct DB update, so it's blocked outright rather than allowed.
        raise AppError(400, "SELF_DEMOTION_FORBIDDEN", "You cannot change your own role")

    old_role = user.role
    user.role = body.role

    if body.role == "driver":
        existing_driver = (
            await session.execute(select(Driver).where(Driver.user_id == user.id))
        ).scalar_one_or_none()
        if existing_driver is None:
            session.add(Driver(user_id=user.id))

    session.add(
        UserEvent(
            user_id=user.id,
            actor_id=admin.id,
            event_type="role_changed",
            payload={"from": old_role, "to": body.role},
        )
    )
    await session.commit()
    await session.refresh(user)
    return user
