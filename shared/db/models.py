from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSTZRANGE, UUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role in ('user','driver','admin')", name="role"),
        CheckConstraint("status in ('pending','verified','blocked')", name="status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    telegram_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, server_default="user")
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")
    full_name: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(32))
    can_order: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    car_model: Mapped[str | None] = mapped_column(String(100))
    car_plate: Mapped[str | None] = mapped_column(String(20))
    car_color: Mapped[str | None] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    # Driver's own real-time presence toggle — distinct from is_active, which
    # is an admin-only permanent enable/disable switch. A driver going
    # off-duty for an hour shouldn't look like an admin-disabled account.
    on_duty: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class DriverSchedule(Base):
    __tablename__ = "driver_schedule"
    __table_args__ = (
        CheckConstraint("weekday between 0 and 6", name="weekday_range"),
        # Blocks literal duplicate rows only, not genuine time-overlap on the
        # same weekday (e.g. 09:00-13:00 and 12:00-17:00 both present) — a
        # true overlap-proof constraint would need the same EXCLUDE/GiST
        # approach orders.excl_orders_driver_overlap uses (see migration
        # 0001), which requires a native range type; start_time/end_time are
        # plain Time columns here, and widening them to support that is a
        # bigger change than this gap warrants. Real overlap prevention is
        # enforced app-side in the schedule-replace endpoint instead, which
        # rewrites the whole weekly grid in one call and can trivially
        # sort+scan for overlaps before committing.
        UniqueConstraint("driver_id", "weekday", "start_time"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False
    )
    weekday: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    start_time: Mapped[dt.time] = mapped_column(nullable=False)
    end_time: Mapped[dt.time] = mapped_column(nullable=False)


class DriverTimeOff(Base):
    __tablename__ = "driver_time_off"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False
    )
    period = mapped_column(TSTZRANGE, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255))


class Address(Base):
    __tablename__ = "addresses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str | None] = mapped_column(String(100))
    address_text: Mapped[str] = mapped_column(String(500), nullable=False)
    lat: Mapped[float | None] = mapped_column(Numeric(9, 6))
    lon: Mapped[float | None] = mapped_column(Numeric(9, 6))
    is_favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    last_used_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(
            "status in ('draft','pending_driver','driver_countered','confirmed','driver_en_route',"
            "'driver_arrived','in_progress','completed','cancelled_by_user','cancelled_by_driver',"
            "'cancelled_by_admin','expired')",
            name="status",
        ),
        # Partial (not global) unique: idempotency_key is only ever set on
        # create, and only needs to be unique per-user, so a replayed
        # create-order request can be looked up by (user_id, key) directly.
        Index(
            "uq_orders_user_idempotency_key",
            "user_id",
            "idempotency_key",
            unique=True,
            postgresql_where=text("idempotency_key IS NOT NULL"),
        ),
        # NOTE: the EXCLUDE USING gist constraint that actually prevents
        # double-booking a driver (excl_orders_driver_overlap) is NOT
        # declared here — SQLAlchemy's Table/Column/Constraint API has no
        # representation for `EXCLUDE USING gist (...)`. It exists only in
        # migration 0001 via `op.execute(...)`. Because of this, any
        # `alembic revision --autogenerate` diff against this table must be
        # reviewed by hand — Alembic has no metadata-side knowledge of that
        # constraint and could otherwise be talked into "fixing" a phantom
        # drift (i.e. dropping it).
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    driver_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("drivers.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="draft")
    from_address: Mapped[str] = mapped_column(String(500), nullable=False)
    from_lat: Mapped[float | None] = mapped_column(Numeric(9, 6))
    from_lon: Mapped[float | None] = mapped_column(Numeric(9, 6))
    to_address: Mapped[str] = mapped_column(String(500), nullable=False)
    to_lat: Mapped[float | None] = mapped_column(Numeric(9, 6))
    to_lon: Mapped[float | None] = mapped_column(Numeric(9, 6))
    scheduled_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    est_duration_min: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="30")
    est_distance_km: Mapped[float | None] = mapped_column(Numeric(6, 2))
    passengers: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="1")
    comment: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    cancel_reason: Mapped[str | None] = mapped_column(String(255))
    cancelled_by: Mapped[str | None] = mapped_column(String(20))
    idempotency_key: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    # Set when a specifically-assigned driver can't make the requested time
    # and proposes a different one instead of rejecting outright (status
    # becomes 'driver_countered'); cleared once the employee accepts/declines.
    proposed_scheduled_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


class OrderEvent(Base):
    __tablename__ = "order_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class UserEvent(Base):
    __tablename__ = "user_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    __table_args__ = (UniqueConstraint("endpoint", name="endpoint"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(String(1000), nullable=False)
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
