from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, model_validator

from api.app.deps import require_verified
from api.app.errors import AppError
from shared.config import get_settings
from shared.db.models import User
from shared.openrouteservice import route_eta_seconds as ors_route_eta_seconds
from shared.yandex_maps import geocode, haversine_km

router = APIRouter(prefix="/v1/routing", tags=["routing"])


class EtaRequest(BaseModel):
    from_lat: float | None = None
    from_lon: float | None = None
    from_address: str | None = None
    to_lat: float | None = None
    to_lon: float | None = None
    to_address: str | None = None

    @model_validator(mode="after")
    def _check_endpoints(self) -> EtaRequest:
        has_from = (self.from_lat is not None and self.from_lon is not None) or self.from_address
        has_to = (self.to_lat is not None and self.to_lon is not None) or self.to_address
        if not has_from or not has_to:
            raise ValueError("each side needs either lat/lon or an address")
        return self


class EtaOut(BaseModel):
    duration_min: int
    distance_km: float
    is_estimated: bool
    source: Literal["real", "fallback"]


async def _resolve(
    lat: float | None, lon: float | None, address: str | None
) -> tuple[float, float]:
    if lat is not None and lon is not None:
        return lat, lon
    resolved = await geocode(address) if address else None
    if resolved is None:
        raise AppError(422, "ADDRESS_NOT_RESOLVED", f"Could not resolve address: {address!r}")
    return resolved


@router.post("/eta", response_model=EtaOut)
async def eta(body: EtaRequest, _user: User = Depends(require_verified)) -> EtaOut:
    from_lat, from_lon = await _resolve(body.from_lat, body.from_lon, body.from_address)
    to_lat, to_lon = await _resolve(body.to_lat, body.to_lon, body.to_address)

    settings = get_settings()

    ors_result = await ors_route_eta_seconds(from_lat, from_lon, to_lat, to_lon)
    if ors_result is not None:
        seconds, distance_meters = ors_result
        duration_min = round(seconds / 60 * settings.ORDER_ETA_BUFFER_FACTOR)
        distance_km = round(distance_meters / 1000, 1)
        return EtaOut(
            duration_min=duration_min, distance_km=distance_km, is_estimated=False, source="real"
        )

    # Fallback formula, tz.md §4.3: avg 30 km/h with a 1.4x margin, labeled
    # as an estimate rather than a precise figure.
    distance_km = round(haversine_km(from_lat, from_lon, to_lat, to_lon), 1)
    duration_min = round(distance_km / 30 * 60 * 1.4)
    return EtaOut(
        duration_min=duration_min, distance_km=distance_km, is_estimated=True, source="fallback"
    )
