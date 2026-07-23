"""Yandex Geocoder client, plus a haversine fallback that requires no API
key at all. geocode() returns None on any failure (missing key, timeout,
bad response) rather than raising — callers treat that uniformly as
"couldn't resolve this via Yandex", never as a request failure of their own.

Real driving-route distance/duration comes from shared/openrouteservice.py,
not Yandex — this account's tier doesn't include Yandex's routing/distance-
matrix product (confirmed: api.routing.yandex.net/v2/route returns a plain
403). Geocoding is a separate product this account does have, verified
directly against a live key.
"""

from __future__ import annotations

import hashlib
import logging
import math

import httpx
from tenacity import retry, stop_after_attempt, wait_fixed

from shared.config import get_settings
from shared.redis_client import get_redis

logger = logging.getLogger(__name__)

_GEOCODE_CACHE_TTL_SEC = 30 * 24 * 3600  # tz.md §4.3: cache geocode results 30 days
_TIMEOUT = httpx.Timeout(2.5)
_EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance — the fallback used whenever Yandex routing is
    unavailable, per tz.md §4.3."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _geocode_cache_key(address_text: str) -> str:
    normalized = " ".join(address_text.strip().lower().split())
    digest = hashlib.sha256(normalized.encode()).hexdigest()
    return f"geocode:{digest}"


async def geocode(address_text: str) -> tuple[float, float] | None:
    """Resolve free-text address to (lat, lon) via Yandex Geocoder, cached in
    Redis for 30 days by normalized text. Returns None if YANDEX_API_KEY is
    unset or the lookup fails for any reason."""
    settings = get_settings()
    if not settings.YANDEX_API_KEY:
        return None

    redis = get_redis()
    cache_key = _geocode_cache_key(address_text)
    cached = await redis.get(cache_key)
    if cached is not None:
        lat_str, lon_str = cached.split(",")
        return float(lat_str), float(lon_str)

    try:
        result = await _geocode_request(address_text, settings.YANDEX_API_KEY)
    except Exception:
        logger.warning("yandex geocode failed for %r", address_text, exc_info=True)
        return None

    if result is None:
        return None

    lat, lon = result
    await redis.set(cache_key, f"{lat},{lon}", ex=_GEOCODE_CACHE_TTL_SEC)
    return lat, lon


@retry(stop=stop_after_attempt(2), wait=wait_fixed(0.5), reraise=True)
async def _geocode_request(address_text: str, api_key: str) -> tuple[float, float] | None:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.get(
            "https://geocode-maps.yandex.ru/1.x/",
            params={"apikey": api_key, "format": "json", "geocode": address_text},
        )
        response.raise_for_status()
        data = response.json()

    members = data["response"]["GeoObjectCollection"]["featureMember"]
    if not members:
        return None
    pos = members[0]["GeoObject"]["Point"]["pos"]  # Yandex returns "lon lat"
    lon_str, lat_str = pos.split(" ")
    return float(lat_str), float(lon_str)
