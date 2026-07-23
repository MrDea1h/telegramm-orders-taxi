"""OpenRouteService (OSM-based) driving-route client — real distance/duration
between two points, used because Yandex's own routing/distance-matrix
product isn't part of this account's tier (confirmed: a direct call to
api.routing.yandex.net/v2/route returns 403). Returns None on any failure
(missing key, timeout, bad response, rate limit) rather than raising —
callers fall back to the haversine estimate uniformly, same contract as
shared/yandex_maps.py.

NOTE: verify the exact auth header format against a live key before
trusting this in production — public docs disagree on whether it's a raw
key or a "Bearer <key>" value; this was written before a real key existed
to test against.
"""

from __future__ import annotations

import logging

import httpx
from tenacity import retry, stop_after_attempt, wait_fixed

from shared.config import get_settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(3.0)
_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/json"


async def route_eta_seconds(
    from_lat: float, from_lon: float, to_lat: float, to_lon: float
) -> tuple[float, float] | None:
    """Real driving (duration_seconds, distance_meters) via OpenRouteService,
    or None if the key is unset or the call fails for any reason."""
    settings = get_settings()
    if not settings.ORS_API_KEY:
        return None

    try:
        return await _directions_request(from_lat, from_lon, to_lat, to_lon, settings.ORS_API_KEY)
    except Exception:
        logger.warning(
            "openrouteservice routing failed for (%s,%s)->(%s,%s)",
            from_lat,
            from_lon,
            to_lat,
            to_lon,
            exc_info=True,
        )
        return None


@retry(stop=stop_after_attempt(2), wait=wait_fixed(0.5), reraise=True)
async def _directions_request(
    from_lat: float, from_lon: float, to_lat: float, to_lon: float, api_key: str
) -> tuple[float, float] | None:
    # ORS coordinates are [lon, lat] — the opposite of this codebase's usual
    # [lat, lon], same gotcha as Yandex's Geocoder (see yandex_maps.py).
    body = {"coordinates": [[from_lon, from_lat], [to_lon, to_lat]]}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(
            _DIRECTIONS_URL,
            headers={"Authorization": api_key},
            json=body,
        )
        response.raise_for_status()
        data = response.json()

    routes = data.get("routes")
    if not routes:
        return None
    summary = routes[0]["summary"]
    return float(summary["duration"]), float(summary["distance"])
