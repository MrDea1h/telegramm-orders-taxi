from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.app.deps import get_current_user
from api.app.errors import AppError
from shared.auth_jwt import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    revoke_token,
)
from shared.db.engine import get_session
from shared.db.models import User
from shared.telegram_init_data import InitDataInvalid, verify_init_data
from shared.telegram_login_widget import LoginWidgetInvalid, verify_login_widget_payload

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TelegramInitDataRequest(BaseModel):
    init_data: str


class ProfileUpdateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=1, max_length=32)


class UserOut(BaseModel):
    id: uuid.UUID
    telegram_id: int
    role: str
    status: str
    full_name: str | None
    phone: str | None
    can_order: bool


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut


def _serialize_user(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        telegram_id=user.telegram_id,
        role=user.role,
        status=user.status,
        full_name=user.full_name,
        phone=user.phone,
        can_order=user.can_order,
    )


async def _issue_tokens(user: User) -> TokenPairOut:
    return TokenPairOut(
        access_token=create_access_token(user),
        refresh_token=create_refresh_token(user),
        user=_serialize_user(user),
    )


@router.post("/refresh")
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_session)) -> dict:
    try:
        payload = await decode_token(body.refresh_token, "refresh")
    except TokenError as e:
        raise AppError(401, "REFRESH_INVALID", "Refresh token is invalid or expired") from e

    user = await session.get(User, uuid.UUID(payload["sub"]))
    if user is None or user.status == "blocked":
        raise AppError(401, "REFRESH_INVALID", "Refresh token is invalid or expired")

    await revoke_token(payload)  # rotation: burn the just-used refresh token
    return {"access_token": create_access_token(user), "refresh_token": create_refresh_token(user)}


@router.post("/logout", status_code=204, response_model=None)
async def logout(body: LogoutRequest) -> None:
    try:
        payload = await decode_token(body.refresh_token, "refresh")
        await revoke_token(payload)
    except TokenError:
        pass  # already invalid/expired — nothing to revoke


async def _find_or_create_telegram_user(session: AsyncSession, parsed: dict[str, Any]) -> User:
    user = (
        await session.execute(select(User).where(User.telegram_id == parsed["telegram_id"]))
    ).scalar_one_or_none()
    if user is None:
        full_name = " ".join(
            filter(None, [parsed.get("first_name"), parsed.get("last_name")])
        ).strip()
        user = User(
            telegram_id=parsed["telegram_id"],
            full_name=full_name or None,
            role="user",
            status="pending",
        )
        session.add(user)
        await session.flush()
    return user


@router.post("/telegram/login-widget", response_model=TokenPairOut)
async def telegram_login_widget(
    payload: dict[str, Any] = Body(...), session: AsyncSession = Depends(get_session)
) -> TokenPairOut:
    try:
        parsed = verify_login_widget_payload(payload)
    except LoginWidgetInvalid as e:
        raise AppError(401, "TELEGRAM_AUTH_INVALID", str(e)) from e

    user = await _find_or_create_telegram_user(session, parsed)
    if user.status == "blocked":
        raise AppError(403, "ACCOUNT_BLOCKED", "This account has been blocked")

    await session.commit()
    return await _issue_tokens(user)


@router.post("/telegram/init-data", response_model=TokenPairOut)
async def telegram_init_data_login(
    body: TelegramInitDataRequest, session: AsyncSession = Depends(get_session)
) -> TokenPairOut:
    try:
        parsed = verify_init_data(body.init_data)
    except InitDataInvalid as e:
        raise AppError(401, "TELEGRAM_AUTH_INVALID", str(e)) from e

    user = await _find_or_create_telegram_user(session, parsed)
    if user.status == "blocked":
        raise AppError(403, "ACCOUNT_BLOCKED", "This account has been blocked")

    await session.commit()
    return await _issue_tokens(user)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return _serialize_user(user)


@router.patch("/profile", response_model=UserOut)
async def update_profile(
    body: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    # Telegram's own first_name/last_name auto-populate full_name at
    # account creation, but that's a nickname, not necessarily the
    # employee's real name — the onboarding profile step always asks the
    # user to confirm/enter it explicitly instead of trusting Telegram's.
    user.full_name = body.full_name
    user.phone = body.phone
    await session.commit()
    return _serialize_user(user)
