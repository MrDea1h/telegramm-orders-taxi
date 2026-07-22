from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ENV: Literal["dev", "test", "prod"] = "dev"
    LOG_LEVEL: str = "INFO"

    DATABASE_URL: str = "postgresql+asyncpg://corpride:corpride@localhost:5432/corpride"
    DB_ECHO: bool = False
    REDIS_URL: str = "redis://localhost:6379/0"

    BOT_TOKEN: str = ""
    BOT_MODE: Literal["polling", "webhook"] = "polling"
    WEBHOOK_BASE_URL: str = ""
    WEBHOOK_SECRET: str = ""

    # --- Reserved for M2 (auth module): JWT issuance + Mini App initData +
    # Telegram Login Widget verification. Declared now so M2 needs no
    # config-only follow-up PR.
    JWT_SECRET: str = "dev-insecure-secret-change-me"
    JWT_ACCESS_TTL_MIN: int = 15
    JWT_REFRESH_TTL_DAYS: int = 30
    INIT_DATA_MAX_AGE_SEC: int = 3600
    TELEGRAM_LOGIN_WIDGET_MAX_AGE_SEC: int = 86400
    ARGON2_TIME_COST: int = 3
    ARGON2_MEMORY_COST: int = 65536
    ARGON2_PARALLELISM: int = 4

    # --- Reserved for M4 (Web Push notifications) ---
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_CLAIMS_EMAIL: str = "admin@example.com"

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "CorpRide <no-reply@example.com>"
    SMTP_USE_TLS: bool = True

    VERIFICATION_CODE_TTL_MIN: int = 10
    VERIFICATION_CODE_MAX_ATTEMPTS: int = 5

    ORDER_BOOKING_HORIZON_DAYS: int = 14
    ORDER_MIN_LEAD_MIN: int = 30
    ORDER_BUFFER_MIN: int = 15

    # Kept as raw CSV strings, not list[...] fields: pydantic-settings
    # attempts a JSON-decode of any complex-typed env value at the source
    # level, before field validators ever run, so an empty-string env var
    # for a list[int]/list[str] field throws a SettingsError right at
    # startup. Plain str avoids that entirely; callers use the helper
    # methods below to get a parsed list.
    ADMIN_TELEGRAM_IDS: str = ""
    CORS_ALLOW_ORIGINS: str = ""

    SENTRY_DSN: str = ""

    def admin_telegram_ids(self) -> list[int]:
        return [int(x.strip()) for x in self.ADMIN_TELEGRAM_IDS.split(",") if x.strip()]

    def cors_allow_origins(self) -> list[str]:
        return [x.strip() for x in self.CORS_ALLOW_ORIGINS.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
