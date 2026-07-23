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
    ORDER_BUFFER_MIN: int = 15

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
