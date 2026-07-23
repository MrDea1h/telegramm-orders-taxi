from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.app.deps import get_current_user
from api.app.errors import AppError
from shared.db.engine import get_session
from shared.db.models import Address, User
from shared.yandex_maps import geocode

router = APIRouter(prefix="/v1/addresses", tags=["addresses"])


class AddressOut(BaseModel):
    id: uuid.UUID
    label: str | None
    address_text: str
    lat: float | None
    lon: float | None
    is_favorite: bool
    last_used_at: dt.datetime | None


class CreateAddressRequest(BaseModel):
    label: str | None = None
    address_text: str = Field(min_length=1, max_length=500)
    lat: float | None = None
    lon: float | None = None
    is_favorite: bool = False


class SetFavoriteRequest(BaseModel):
    is_favorite: bool


class TouchAddressRequest(BaseModel):
    address_text: str = Field(min_length=1, max_length=500)
    lat: float | None = None
    lon: float | None = None


@router.get("", response_model=list[AddressOut])
async def list_addresses(
    scope: Literal["favorites", "recent"],
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Address]:
    if scope == "favorites":
        stmt = (
            select(Address)
            .where(Address.user_id == user.id, Address.is_favorite.is_(True))
            .order_by(Address.label)
        )
    else:
        stmt = (
            select(Address)
            .where(Address.user_id == user.id, Address.is_favorite.is_(False))
            .order_by(Address.last_used_at.desc().nullslast())
            .limit(5)
        )
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("", status_code=201, response_model=AddressOut)
async def create_address(
    body: CreateAddressRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Address:
    lat, lon = body.lat, body.lon
    if lat is None or lon is None:
        # Best-effort — an address is still useful to save even if geocoding
        # fails or Yandex isn't configured; only the map/ETA steps need coords.
        resolved = await geocode(body.address_text)
        if resolved is not None:
            lat, lon = resolved

    address = Address(
        user_id=user.id,
        label=body.label,
        address_text=body.address_text,
        lat=lat,
        lon=lon,
        is_favorite=body.is_favorite,
    )
    session.add(address)
    await session.commit()
    await session.refresh(address)
    return address


@router.patch("/{address_id}/favorite", response_model=AddressOut)
async def set_favorite(
    address_id: uuid.UUID,
    body: SetFavoriteRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Address:
    address = await session.get(Address, address_id)
    if address is None or address.user_id != user.id:
        raise AppError(404, "NOT_FOUND", "Address not found")
    address.is_favorite = body.is_favorite
    await session.commit()
    await session.refresh(address)
    return address


@router.delete("/{address_id}", status_code=204, response_model=None)
async def delete_address(
    address_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    address = await session.get(Address, address_id)
    if address is None or address.user_id != user.id:
        raise AppError(404, "NOT_FOUND", "Address not found")
    await session.delete(address)
    await session.commit()


@router.post("/touch", response_model=AddressOut)
async def touch_address(
    body: TouchAddressRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Address:
    """Called right after the wizard's address step, independent of whether
    an order is ever created — this is what makes "recent" real instead of
    derived only from completed orders."""
    existing = (
        await session.execute(
            select(Address).where(
                Address.user_id == user.id,
                Address.address_text == body.address_text,
                Address.is_favorite.is_(False),
            )
        )
    ).scalar_one_or_none()

    now = dt.datetime.now(dt.UTC)
    if existing is not None:
        existing.last_used_at = now
        if body.lat is not None and body.lon is not None:
            existing.lat, existing.lon = body.lat, body.lon
        address = existing
    else:
        address = Address(
            user_id=user.id,
            address_text=body.address_text,
            lat=body.lat,
            lon=body.lon,
            is_favorite=False,
            last_used_at=now,
        )
        session.add(address)

    await session.commit()
    await session.refresh(address)
    return address
