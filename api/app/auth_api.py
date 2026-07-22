from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import secrets
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
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
from shared.auth_passwords import hash_password, verify_against_dummy, verify_password
from shared.config import get_settings
from shared.db.engine import get_session
from shared.db.models import User, VerificationCode
from shared.email_send import send_email
from shared.redis_client import get_redis
from shared.telegram_init_data import InitDataInvalid, verify_init_data
from shared.telegram_login_widget import LoginWidgetInvalid, verify_login_widget_payload

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: str = Field(min_length=1, max_length=200)


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TelegramInitDataRequest(BaseModel):
    init_data: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str | None
    telegram_id: int | None
    role: str
    status: str
    full_name: str | None
    phone: str | None
    can_order: bool
    email_confirmed_at: dt.datetime | None


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut


def _serialize_user(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        telegram_id=user.telegram_id,
        role=user.role,
        status=user.status,
        full_name=user.full_name,
        phone=user.phone,
        can_order=user.can_order,
        email_confirmed_at=user.email_confirmed_at,
    )


async def _issue_tokens(user: User) -> TokenPairOut:
    return TokenPairOut(
        access_token=create_access_token(user),
        refresh_token=create_refresh_token(user),
        user=_serialize_user(user),
    )


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def _check_code_rate_limit(email: str) -> None:
    redis = get_redis()
    key = f"ratelimit:verify-code:{email.lower()}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 3600)
    if count > 3:
        raise AppError(429, "CODE_RATE_LIMITED", "Too many codes requested — try again in an hour")


async def _issue_verification_code(session: AsyncSession, user: User) -> str:
    settings = get_settings()
    # One active code per user+channel at a time — simplifies lookup on
    # verify (no ordering/created_at needed) and prevents stale codes from
    # lingering as valid alongside a freshly issued one.
    await session.execute(
        delete(VerificationCode).where(
            VerificationCode.user_id == user.id, VerificationCode.channel == "email"
        )
    )
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = dt.datetime.now(dt.UTC) + dt.timedelta(minutes=settings.VERIFICATION_CODE_TTL_MIN)
    session.add(
        VerificationCode(
            user_id=user.id, code_hash=_hash_code(code), channel="email", expires_at=expires_at
        )
    )
    return code


@router.post("/register", status_code=202)
async def register(body: RegisterRequest, session: AsyncSession = Depends(get_session)) -> dict:
    await _check_code_rate_limit(body.email)

    existing = (
        await session.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()

    if existing is not None and existing.email_confirmed_at is not None:
        raise AppError(409, "EMAIL_TAKEN", "This email is already registered and confirmed")

    if existing is not None:
        # Unconfirmed existing registration — treat as a resend, refreshing
        # the password/name in case they changed their mind before
        # confirming (only the mailbox owner can complete the confirmation
        # code step regardless).
        user = existing
        user.password_hash = hash_password(body.password)
        user.full_name = body.full_name
    else:
        user = User(
            email=body.email,
            password_hash=hash_password(body.password),
            full_name=body.full_name,
            role="user",
            status="pending",
        )
        session.add(user)

    await session.flush()
    settings = get_settings()
    code = await _issue_verification_code(session, user)
    await session.commit()

    await send_email(
        to=body.email,
        subject="Код подтверждения ApexRide",
        body=f"Ваш код: {code}\nОн действует {settings.VERIFICATION_CODE_TTL_MIN} минут.",
    )

    return {"status": "pending_verification"}


@router.post("/verify-email", response_model=TokenPairOut)
async def verify_email(
    body: VerifyEmailRequest, session: AsyncSession = Depends(get_session)
) -> TokenPairOut:
    user = (
        await session.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if user is None:
        raise AppError(400, "CODE_INVALID", "Invalid code")

    code_row = (
        await session.execute(
            select(VerificationCode).where(
                VerificationCode.user_id == user.id, VerificationCode.channel == "email"
            )
        )
    ).scalar_one_or_none()
    if code_row is None:
        raise AppError(400, "CODE_INVALID", "Invalid code")

    settings = get_settings()
    if code_row.attempts >= settings.VERIFICATION_CODE_MAX_ATTEMPTS:
        raise AppError(429, "CODE_TOO_MANY_ATTEMPTS", "Too many attempts — request a new code")

    if code_row.expires_at < dt.datetime.now(dt.UTC):
        raise AppError(410, "CODE_EXPIRED", "Code expired — request a new one")

    if not hmac.compare_digest(_hash_code(body.code), code_row.code_hash):
        code_row.attempts += 1
        await session.commit()
        raise AppError(400, "CODE_INVALID", "Invalid code")

    user.email_confirmed_at = dt.datetime.now(dt.UTC)
    await session.delete(code_row)
    await session.commit()

    return await _issue_tokens(user)


@router.post("/login", response_model=TokenPairOut)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)) -> TokenPairOut:
    user = (
        await session.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()

    if user is None or user.password_hash is None:
        verify_against_dummy(body.password)
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")

    if not verify_password(user.password_hash, body.password):
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")

    if user.status == "blocked":
        raise AppError(403, "ACCOUNT_BLOCKED", "This account has been blocked")

    if user.email_confirmed_at is None:
        raise AppError(403, "EMAIL_NOT_CONFIRMED", "Please confirm your email first")

    return await _issue_tokens(user)


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
