from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.app.deps import require_role
from api.app.errors import AppError
from api.app.orders_api import TERMINAL_STATUSES, OrderOut, serialize_order
from shared.auth_jwt import revoke_all_sessions
from shared.db.engine import get_session
from shared.db.models import Driver, Order, OrderEvent, User, UserEvent

router = APIRouter(prefix="/v1/admin", tags=["admin"])


class VerificationRequestOut(BaseModel):
    id: uuid.UUID
    full_name: str | None
    phone: str | None
    telegram_id: int
    created_at: dt.datetime


class RejectRequest(BaseModel):
    reason: str


class AdminUserOut(BaseModel):
    id: uuid.UUID
    full_name: str | None
    phone: str | None
    telegram_id: int
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
    # Every pending user is already identity-proven — Telegram's own
    # signature verified control of that account at login time, and
    # telegram_id is mandatory on every row now (no separate email path).
    result = await session.execute(
        select(User).where(User.status == "pending").order_by(User.created_at)
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


class AdminOrderOut(OrderOut):
    user_full_name: str | None = None
    user_phone: str | None = None


class AssignRequest(BaseModel):
    driver_id: uuid.UUID | None = None


class AdminCancelRequest(BaseModel):
    reason: str


ADMIN_REASSIGNABLE_STATUSES = ("pending_driver", "confirmed", "driver_en_route")


async def _serialize_admin(order: Order, session: AsyncSession) -> AdminOrderOut:
    base = await serialize_order(order, session)
    out = AdminOrderOut(**base.model_dump())
    orderer = await session.get(User, order.user_id)
    if orderer is not None:
        out.user_full_name = orderer.full_name
        out.user_phone = orderer.phone
    return out


@router.get("/orders", response_model=list[AdminOrderOut])
async def list_admin_orders(
    status: str | None = None,
    driver_id: uuid.UUID | None = None,
    date_from: dt.datetime | None = None,
    date_to: dt.datetime | None = None,
    admin: User = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> list[AdminOrderOut]:
    stmt = select(Order)
    if status is not None:
        stmt = stmt.where(Order.status == status)
    if driver_id is not None:
        stmt = stmt.where(Order.driver_id == driver_id)
    if date_from is not None:
        stmt = stmt.where(Order.scheduled_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(Order.scheduled_at <= date_to)
    result = await session.execute(stmt.order_by(Order.scheduled_at.desc()))
    orders = result.scalars().all()
    return [await _serialize_admin(o, session) for o in orders]


@router.patch("/orders/{order_id}/assign", response_model=AdminOrderOut)
async def assign_order(
    order_id: uuid.UUID,
    body: AssignRequest,
    admin: User = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> AdminOrderOut:
    order = await session.get(Order, order_id)
    if order is None:
        raise AppError(404, "NOT_FOUND", "Order not found")
    if order.status not in ADMIN_REASSIGNABLE_STATUSES:
        raise AppError(409, "INVALID_TRANSITION", "Order can no longer be reassigned")

    if body.driver_id is not None and await session.get(Driver, body.driver_id) is None:
        raise AppError(404, "NOT_FOUND", "Driver not found")

    from_driver_id = order.driver_id
    order.driver_id = body.driver_id
    order.updated_at = dt.datetime.now(dt.UTC)
    session.add(
        OrderEvent(
            order_id=order.id,
            event_type="admin_reassigned",
            actor_id=admin.id,
            payload={
                "from_driver_id": str(from_driver_id) if from_driver_id else None,
                "to_driver_id": str(body.driver_id) if body.driver_id else None,
            },
        )
    )

    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise AppError(
            409, "SLOT_CONFLICT", "That driver already has an overlapping booking"
        ) from e

    await session.refresh(order)
    return await _serialize_admin(order, session)


@router.post("/orders/{order_id}/cancel", response_model=AdminOrderOut)
async def admin_cancel_order(
    order_id: uuid.UUID,
    body: AdminCancelRequest,
    admin: User = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> AdminOrderOut:
    order = await session.get(Order, order_id)
    if order is None:
        raise AppError(404, "NOT_FOUND", "Order not found")
    if order.status in TERMINAL_STATUSES:
        raise AppError(409, "INVALID_TRANSITION", "Order is already in a terminal state")

    previous_status = order.status
    order.status = "cancelled_by_admin"
    order.cancel_reason = body.reason
    order.cancelled_by = "admin"
    order.updated_at = dt.datetime.now(dt.UTC)
    session.add(
        OrderEvent(
            order_id=order.id,
            event_type="cancelled_by_admin",
            actor_id=admin.id,
            payload={"reason": body.reason, "previous_status": previous_status},
        )
    )
    await session.commit()
    await session.refresh(order)
    return await _serialize_admin(order, session)
