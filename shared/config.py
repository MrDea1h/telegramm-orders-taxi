from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ENV: Literal["dev", "test", "prod"] = "dev"
    LOG_LEVEL: str = "INFO"

    DATABASE_URL: str = "postgresql+asyncpg://apexride:apexride@localhost:5432/apexride"
    DB_ECHO: bool = False
    REDIS_URL: str = "redis://localhost:6379/0"

    BOT_TOKEN: str = ""
    BOT_MODE: Literal["polling", "webhook"] = "polling"
    WEBHOOK_BASE_URL: str = ""
    WEBHOOK_SECRET: str = ""
    # Deployed webapp URL — the bot's /start button opens this as a Telegram
    # Mini App, which is how a real initData payload ever gets produced.
    WEBAPP_URL: str = ""

    # JWT issuance + Mini App initData + Telegram Login Widget verification
    # — Telegram is the only auth path, so no password/email settings exist.
    JWT_SECRET: str = "dev-insecure-secret-change-me"
    JWT_ACCESS_TTL_MIN: int = 15
    JWT_REFRESH_TTL_DAYS: int = 30
    INIT_DATA_MAX_AGE_SEC: int = 3600
    TELEGRAM_LOGIN_WIDGET_MAX_AGE_SEC: int = 86400

    # --- Reserved for M4 (Web Push notifications) ---
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_CLAIMS_EMAIL: str = "admin@example.com"

    ORDER_BOOKING_HORIZON_DAYS: int = 14
    ORDER_MIN_LEAD_MIN: int = 30
    # Flat gap enforced between a driver's consecutive bookings — a stopgap
    # for the fact this doesn't (yet) account for real drive time from the
    # previous ride's drop-off to the next pickup (would need an ORS call
    # per candidate slot; deferred, see docs/context). Doubled from the
    # original 15 for exactly that reason — see migration 0006, which keeps
    # the DB's own order_busy_range() function (the real EXCLUDE-constraint
    # source of truth) in sync with this advisory value.
    ORDER_BUFFER_MIN: int = 30
    # Wall-clock basis for driver-schedule/slot math — DriverSchedule.weekday
    # and start_time/end_time are naive local-time values, this is how they
    # get anchored to real UTC instants.
    COMPANY_TZ: str = "Europe/Moscow"
    # Empty = routing/eta.py falls back to a haversine-distance estimate
    # instead of calling Yandex — lets the order wizard work in dev/CI with
    # zero external credentials. Only used for geocoding now (Yandex's
    # routing/distance-matrix product isn't part of this account's tier —
    # confirmed via a direct 403 against api.routing.yandex.net).
    YANDEX_API_KEY: str = ""
    # Real driving-route distance/duration — OpenRouteService (OSM-based),
    # chosen specifically because it's free and Yandex's own routing product
    # isn't available on this account. Empty = haversine fallback, same
    # graceful-degradation contract as YANDEX_API_KEY above.
    ORS_API_KEY: str = ""
    ORDER_ETA_BUFFER_FACTOR: float = 1.2
    ORDER_SLOT_STEP_MIN: int = 30
    # Audit-only threshold: OrderEvent payloads record whether a cancel fell
    # inside this window, for a future stats feature — nothing is gated on it.
    ORDER_LATE_CANCEL_MIN: int = 60

    # Kept as a raw CSV string, not a list[...] field: pydantic-settings
    # attempts a JSON-decode of any complex-typed env value at the source
    # level, before field validators ever run, so an empty-string env var
    # for a list[str] field throws a SettingsError right at startup. Plain
    # str avoids that entirely; callers use the helper method below.
    CORS_ALLOW_ORIGINS: str = ""

    SENTRY_DSN: str = ""

    def cors_allow_origins(self) -> list[str]:
        return [x.strip() for x in self.CORS_ALLOW_ORIGINS.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
