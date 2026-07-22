from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.app.deps import require_role
from api.app.errors import AppError
from shared.auth_jwt import revoke_all_sessions
from shared.db.engine import get_session
from shared.db.models import User, UserEvent

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
