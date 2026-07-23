from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select, update
from sqlalchemy.dialects.postgresql import Range
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.app.deps import get_current_user, require_role, require_verified
from api.app.errors import AppError
from shared.config import get_settings
from shared.db.engine import get_session
from shared.db.models import Address, Driver, DriverSchedule, DriverTimeOff, Order, OrderEvent, User
from shared.drivers import get_or_create_own_driver
from shared.openrouteservice import route_eta_seconds as ors_route_eta_seconds
from shared.order_notify import (
    notify_counter_accepted,
    notify_driver_approaching,
    notify_driver_departed,
    notify_order_accepted,
    notify_order_cancelled,
    notify_order_rescheduled,
)
from shared.slots import compute_slots

router = APIRouter(prefix="/v1/orders", tags=["orders"])

# Route order matters below: /slots and /queue are declared before /{order_id}
# so FastAPI doesn't swallow them as an order_id path param.

NON_TERMINAL_STATUSES = (
    "draft",
    "pending_driver",
    "driver_countered",
    "confirmed",
    "driver_en_route",
    "driver_arrived",
    "in_progress",
)
TERMINAL_STATUSES = (
    "completed",
    "cancelled_by_user",
    "cancelled_by_driver",
    "cancelled_by_admin",
    "expired",
)
EDITABLE_STATUSES = ("draft", "pending_driver", "confirmed")
CANCELLABLE_STATUSES = (
    "draft",
    "pending_driver",
    "driver_countered",
    "confirmed",
    "driver_en_route",
)

# action -> (required_from_status, resulting_to_status)
_TRANSITIONS: dict[str, tuple[str, str]] = {
    "accept": ("pending_driver", "confirmed"),
    "reject": ("pending_driver", "cancelled_by_driver"),
    # Only reachable when the order is already assigned to a specific
    # driver (see the driver_guard below — non-accept actions always
    # require Order.driver_id == self, "any driver" orders can't match).
    "propose_time": ("pending_driver", "driver_countered"),
    "depart": ("confirmed", "driver_en_route"),
    "arrive": ("driver_en_route", "driver_arrived"),
    "start": ("driver_arrived", "in_progress"),
    "complete": ("in_progress", "completed"),
}


class OrderOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    driver_id: uuid.UUID | None
    status: str
    from_address: str
    from_lat: float | None
    from_lon: float | None
    to_address: str
    to_lat: float | None
    to_lon: float | None
    scheduled_at: dt.datetime
    est_duration_min: int
    est_distance_km: float | None
    passengers: int
    comment: str | None
    created_at: dt.datetime
    updated_at: dt.datetime
    cancel_reason: str | None
    cancelled_by: str | None
    proposed_scheduled_at: dt.datetime | None
    driver_full_name: str | None = None
    driver_car_model: str | None = None
    driver_car_plate: str | None = None
    driver_car_color: str | None = None


class CreateOrderRequest(BaseModel):
    idempotency_key: uuid.UUID
    from_address: str = Field(min_length=1, max_length=500)
    from_lat: float | None = None
    from_lon: float | None = None
    to_address: str = Field(min_length=1, max_length=500)
    to_lat: float | None = None
    to_lon: float | None = None
    scheduled_at: dt.datetime
    est_duration_min: int = 30
    est_distance_km: float | None = None
    passengers: int = Field(default=1, ge=1, le=4)
    comment: str | None = Field(default=None, max_length=500)
    driver_id: uuid.UUID | None = None


class PatchOrderRequest(BaseModel):
    comment: str | None = None
    passengers: int | None = Field(default=None, ge=1, le=4)


class CancelRequest(BaseModel):
    reason: str | None = None


class TransitionRequest(BaseModel):
    action: Literal["accept", "reject", "propose_time", "depart", "arrive", "start", "complete"]
    reason: str | None = None
    proposed_scheduled_at: dt.datetime | None = None


class CounterResponseRequest(BaseModel):
    accept: bool


class SlotsOut(BaseModel):
    times: list[dt.datetime]
    booking_horizon_days: int
    min_lead_min: int


def _touch(order: Order) -> None:
    order.updated_at = dt.datetime.now(dt.UTC)


def _is_weekend(moment: dt.datetime, tz: dt.tzinfo) -> bool:
    """Hard business rule, not a per-driver preference: this is a corporate
    weekday-only product, so Saturday/Sunday are structurally out of scope
    everywhere a booking time is accepted — regardless of what an
    individual driver's own DriverSchedule rows might contain."""
    return moment.astimezone(tz).weekday() >= 5


async def serialize_order(order: Order, session: AsyncSession) -> OrderOut:
    out = OrderOut.model_validate(order, from_attributes=True)
    if order.driver_id is not None:
        row = (
            await session.execute(
                select(Driver, User.full_name)
                .join(User, User.id == Driver.user_id)
                .where(Driver.id == order.driver_id)
            )
        ).first()
        if row is not None:
            driver, full_name = row
            out.driver_full_name = full_name
            out.driver_car_model = driver.car_model
            out.driver_car_plate = driver.car_plate
            out.driver_car_color = driver.car_color
    return out


async def _touch_address(
    session: AsyncSession,
    user_id: uuid.UUID,
    address_text: str,
    lat: float | None,
    lon: float | None,
) -> None:
    existing = (
        await session.execute(
            select(Address).where(
                Address.user_id == user_id,
                Address.address_text == address_text,
                Address.is_favorite.is_(False),
            )
        )
    ).scalar_one_or_none()
    now = dt.datetime.now(dt.UTC)
    if existing is not None:
        existing.last_used_at = now
        if lat is not None and lon is not None:
            existing.lat, existing.lon = lat, lon
    else:
        session.add(
            Address(
                user_id=user_id,
                address_text=address_text,
                lat=lat,
                lon=lon,
                is_favorite=False,
                last_used_at=now,
            )
        )


async def _real_gap_min(
    from_lat: float | None,
    from_lon: float | None,
    to_lat: float | None,
    to_lon: float | None,
    settings,
) -> int:
    """Real drive time (minutes) from (from_lat, from_lon) to (to_lat,
    to_lon) plus a small safety margin (ORDER_REAL_TRANSIT_MARGIN_MIN) on
    top, when we can compute it — never less than the flat ORDER_BUFFER_MIN
    floor. Falls back to the flat value whenever any endpoint's coordinates
    are missing or the ORS call fails, exactly like every other
    real-routing call in this codebase."""
    if from_lat is None or from_lon is None or to_lat is None or to_lon is None:
        return settings.ORDER_BUFFER_MIN
    result = await ors_route_eta_seconds(from_lat, from_lon, to_lat, to_lon)
    if result is None:
        return settings.ORDER_BUFFER_MIN
    transit_seconds, _distance_meters = result
    real_gap = round(transit_seconds / 60) + settings.ORDER_REAL_TRANSIT_MARGIN_MIN
    return max(real_gap, settings.ORDER_BUFFER_MIN)


@router.get("/slots", response_model=SlotsOut)
async def get_slots(
    date: dt.date = Query(...),
    driver_id: uuid.UUID | None = Query(default=None),
    duration_min: int = Query(default=30, ge=1),
    from_lat: float | None = Query(default=None),
    from_lon: float | None = Query(default=None),
    to_lat: float | None = Query(default=None),
    to_lon: float | None = Query(default=None),
    _user: User = Depends(require_verified),
    session: AsyncSession = Depends(get_session),
) -> SlotsOut:
    settings = get_settings()
    tz = ZoneInfo(settings.COMPANY_TZ)
    now = dt.datetime.now(dt.UTC)
    today_local = now.astimezone(tz).date()
    horizon_end = today_local + dt.timedelta(days=settings.ORDER_BOOKING_HORIZON_DAYS)

    if date < today_local or date > horizon_end:
        raise AppError(400, "OUT_OF_HORIZON", "Requested date is outside the booking horizon")

    if date.weekday() >= 5:
        # Weekday-only product — no candidate driver, however scheduled,
        # can ever have a slot on Saturday/Sunday. Skip the DB work entirely.
        return SlotsOut(
            times=[],
            booking_horizon_days=settings.ORDER_BOOKING_HORIZON_DAYS,
            min_lead_min=settings.ORDER_MIN_LEAD_MIN,
        )

    if driver_id is not None:
        driver = await session.get(Driver, driver_id)
        if driver is None or not driver.is_active or not driver.on_duty:
            raise AppError(400, "DRIVER_UNAVAILABLE", "Driver is not available")
        candidate_drivers = [driver]
    else:
        # Exclude admin accounts' auto-provisioned Driver rows (see the
        # superuser "act as driver" decision) from the "any available
        # driver" pool — those are for the admin's own self-service driver
        # flows, not something a real "любой свободный" booking should ever
        # land on.
        result = await session.execute(
            select(Driver)
            .join(User, User.id == Driver.user_id)
            .where(Driver.is_active.is_(True), Driver.on_duty.is_(True), User.role == "driver")
        )
        candidate_drivers = list(result.scalars().all())

    weekday = date.weekday()
    day_start_local = dt.datetime.combine(date, dt.time.min, tzinfo=tz)
    day_start_utc = day_start_local.astimezone(dt.UTC)
    day_end_utc = (day_start_local + dt.timedelta(days=1)).astimezone(dt.UTC)
    window_pad = dt.timedelta(hours=4)

    all_times: set[dt.datetime] = set()
    for driver in candidate_drivers:
        schedule_rows = (
            (
                await session.execute(
                    select(DriverSchedule).where(
                        DriverSchedule.driver_id == driver.id, DriverSchedule.weekday == weekday
                    )
                )
            )
            .scalars()
            .all()
        )
        if not schedule_rows:
            continue
        schedule_windows = [(row.start_time, row.end_time) for row in schedule_rows]

        time_off_rows = (
            (
                await session.execute(
                    select(DriverTimeOff).where(
                        DriverTimeOff.driver_id == driver.id,
                        DriverTimeOff.period.op("&&")(Range(day_start_utc, day_end_utc)),
                    )
                )
            )
            .scalars()
            .all()
        )
        busy_ranges = [(row.period.lower, row.period.upper) for row in time_off_rows]

        order_rows = (
            (
                await session.execute(
                    select(Order).where(
                        Order.driver_id == driver.id,
                        Order.status.in_(NON_TERMINAL_STATUSES),
                        Order.scheduled_at >= day_start_utc - window_pad,
                        Order.scheduled_at <= day_end_utc + window_pad,
                    )
                )
            )
            .scalars()
            .all()
        )
        for o in order_rows:
            # Two independent real-transit checks against this one existing
            # booking: can the driver realistically reach ITS pickup after
            # finishing a new ride ending right before it (gap_before), and
            # can they realistically reach the NEW ride's pickup after
            # finishing this one (gap_after)? Both extend the busy window
            # outward — never shrink it — so a missing coordinate/failed ORS
            # call always falls back to the flat, more conservative buffer.
            #
            # compute_slots() already pads every candidate's own tail by
            # ORDER_BUFFER_MIN (its `buffer_min` param) before checking for
            # overlap — that's how the "before" side normally gets its
            # flat-buffer protection. gap_before must only contribute
            # whatever real-transit time exceeds that, or a candidate ending
            # right before this booking would be double-buffered (flat
            # buffer once from compute_slots' own tail padding, once more
            # from gap_before) and get pushed earlier than the real
            # constraint requires. gap_after has no equivalent overlap since
            # compute_slots never pads a candidate's *start* side.
            gap_before = await _real_gap_min(to_lat, to_lon, o.from_lat, o.from_lon, settings)
            gap_after = await _real_gap_min(o.to_lat, o.to_lon, from_lat, from_lon, settings)
            extra_gap_before = max(0, gap_before - settings.ORDER_BUFFER_MIN)
            busy_start = o.scheduled_at - dt.timedelta(minutes=extra_gap_before)
            busy_end = o.scheduled_at + dt.timedelta(minutes=o.est_duration_min + gap_after)
            busy_ranges.append((busy_start, busy_end))

        slots = compute_slots(
            date=date,
            schedule_windows=schedule_windows,
            busy_ranges=busy_ranges,
            duration_min=duration_min,
            buffer_min=settings.ORDER_BUFFER_MIN,
            step_min=settings.ORDER_SLOT_STEP_MIN,
            min_lead_min=settings.ORDER_MIN_LEAD_MIN,
            now=now,
            tz=tz,
        )
        all_times.update(slots)

    return SlotsOut(
        times=sorted(all_times),
        booking_horizon_days=settings.ORDER_BOOKING_HORIZON_DAYS,
        min_lead_min=settings.ORDER_MIN_LEAD_MIN,
    )


@router.get("/queue", response_model=list[OrderOut])
async def get_queue(
    user: User = Depends(require_role("driver", "admin")),
    session: AsyncSession = Depends(get_session),
) -> list[OrderOut]:
    driver = await get_or_create_own_driver(user, session)
    if driver is None:
        raise AppError(404, "NOT_FOUND", "No driver profile for this account")

    result = await session.execute(
        select(Order)
        .where(
            Order.status.in_(NON_TERMINAL_STATUSES),
            or_(
                Order.driver_id == driver.id,
                and_(Order.driver_id.is_(None), Order.status == "pending_driver"),
            ),
        )
        .order_by(Order.scheduled_at)
    )
    orders = result.scalars().all()
    return [await serialize_order(o, session) for o in orders]


@router.post("", status_code=201, response_model=OrderOut)
async def create_order(
    body: CreateOrderRequest,
    response: Response,
    user: User = Depends(require_verified),
    session: AsyncSession = Depends(get_session),
) -> OrderOut:
    if not user.can_order:
        raise AppError(403, "CANNOT_ORDER", "This account is not allowed to place orders")

    existing = (
        await session.execute(
            select(Order).where(
                Order.user_id == user.id, Order.idempotency_key == body.idempotency_key
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        # The route decorator's status_code=201 is the default for a normal
        # create — override it here since a replay isn't creating anything.
        response.status_code = 200
        return await serialize_order(existing, session)

    settings = get_settings()
    now = dt.datetime.now(dt.UTC)
    if body.scheduled_at < now + dt.timedelta(minutes=settings.ORDER_MIN_LEAD_MIN):
        raise AppError(400, "LEAD_TIME_TOO_SHORT", "scheduled_at is too soon")
    if body.scheduled_at > now + dt.timedelta(days=settings.ORDER_BOOKING_HORIZON_DAYS):
        raise AppError(400, "OUT_OF_HORIZON", "scheduled_at is beyond the booking horizon")
    if _is_weekend(body.scheduled_at, ZoneInfo(settings.COMPANY_TZ)):
        raise AppError(400, "WEEKEND_NOT_ALLOWED", "Bookings are not available on weekends")

    if body.driver_id is not None:
        driver = await session.get(Driver, body.driver_id)
        if driver is None or not driver.is_active or not driver.on_duty:
            raise AppError(400, "DRIVER_UNAVAILABLE", "Driver is not available")

    order = Order(
        user_id=user.id,
        driver_id=body.driver_id,
        status="pending_driver",
        from_address=body.from_address,
        from_lat=body.from_lat,
        from_lon=body.from_lon,
        to_address=body.to_address,
        to_lat=body.to_lat,
        to_lon=body.to_lon,
        scheduled_at=body.scheduled_at,
        est_duration_min=body.est_duration_min,
        est_distance_km=body.est_distance_km,
        passengers=body.passengers,
        comment=body.comment,
        idempotency_key=body.idempotency_key,
    )
    session.add(order)
    try:
        await session.flush()
    except IntegrityError as e:
        await session.rollback()
        raise AppError(
            409, "SLOT_CONFLICT", "That driver already has an overlapping booking"
        ) from e

    await _touch_address(session, user.id, body.from_address, body.from_lat, body.from_lon)
    await _touch_address(session, user.id, body.to_address, body.to_lat, body.to_lon)
    session.add(
        OrderEvent(
            order_id=order.id,
            event_type="created",
            actor_id=user.id,
            payload={"driver_id": str(body.driver_id) if body.driver_id else None},
        )
    )
    await session.commit()
    await session.refresh(order)
    return await serialize_order(order, session)


@router.get("", response_model=list[OrderOut])
async def list_orders(
    scope: Literal["upcoming", "history"],
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[OrderOut]:
    if scope == "upcoming":
        stmt = (
            select(Order)
            .where(Order.user_id == user.id, Order.status.in_(NON_TERMINAL_STATUSES))
            .order_by(Order.scheduled_at)
        )
    else:
        stmt = (
            select(Order)
            .where(Order.user_id == user.id, Order.status.in_(TERMINAL_STATUSES))
            .order_by(Order.scheduled_at.desc())
        )
    result = await session.execute(stmt)
    orders = result.scalars().all()
    return [await serialize_order(o, session) for o in orders]


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OrderOut:
    order = await session.get(Order, order_id)
    if order is None:
        raise AppError(404, "NOT_FOUND", "Order not found")

    if order.user_id == user.id or user.role == "admin":
        return await serialize_order(order, session)

    if user.role == "driver":
        driver = (
            await session.execute(select(Driver).where(Driver.user_id == user.id))
        ).scalar_one_or_none()
        if driver is not None and (
            order.driver_id == driver.id
            or (order.driver_id is None and order.status == "pending_driver")
        ):
            return await serialize_order(order, session)

    raise AppError(403, "FORBIDDEN", "Not allowed to view this order")


@router.patch("/{order_id}", response_model=OrderOut)
async def update_order(
    order_id: uuid.UUID,
    body: PatchOrderRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OrderOut:
    order = await session.get(Order, order_id)
    if order is None or order.user_id != user.id:
        raise AppError(404, "NOT_FOUND", "Order not found")
    if order.status not in EDITABLE_STATUSES:
        raise AppError(409, "INVALID_TRANSITION", "Order can no longer be edited")

    if body.comment is not None:
        order.comment = body.comment
    if body.passengers is not None:
        order.passengers = body.passengers
    _touch(order)
    await session.commit()
    await session.refresh(order)
    return await serialize_order(order, session)


@router.post("/{order_id}/cancel", response_model=OrderOut)
async def cancel_order(
    order_id: uuid.UUID,
    body: CancelRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OrderOut:
    order = await session.get(Order, order_id)
    if order is None or order.user_id != user.id:
        raise AppError(404, "NOT_FOUND", "Order not found")
    if order.status not in CANCELLABLE_STATUSES:
        raise AppError(409, "INVALID_TRANSITION", "Order can no longer be cancelled")

    settings = get_settings()
    now = dt.datetime.now(dt.UTC)
    minutes_before = int((order.scheduled_at - now).total_seconds() // 60)

    order.status = "cancelled_by_user"
    order.cancel_reason = body.reason
    order.cancelled_by = "user"
    _touch(order)

    session.add(
        OrderEvent(
            order_id=order.id,
            event_type="cancelled_by_user",
            actor_id=user.id,
            payload={
                "reason": body.reason,
                "minutes_before_scheduled": minutes_before,
                "is_late": minutes_before < settings.ORDER_LATE_CANCEL_MIN,
            },
        )
    )
    await session.commit()
    await session.refresh(order)

    if order.driver_id is not None:
        driver_chat_id = (
            await session.execute(
                select(User.telegram_id)
                .join(Driver, Driver.user_id == User.id)
                .where(Driver.id == order.driver_id)
            )
        ).scalar_one_or_none()
        if driver_chat_id is not None:
            await notify_order_cancelled(driver_chat_id, order, "Клиент отменил заказ")

    return await serialize_order(order, session)


@router.post("/{order_id}/transition", response_model=OrderOut)
async def transition_order(
    order_id: uuid.UUID,
    body: TransitionRequest,
    user: User = Depends(require_role("driver", "admin")),
    session: AsyncSession = Depends(get_session),
) -> OrderOut:
    driver = await get_or_create_own_driver(user, session)
    if driver is None:
        raise AppError(404, "NOT_FOUND", "No driver profile for this account")

    if body.action == "reject" and not body.reason:
        raise AppError(400, "REASON_REQUIRED", "A rejection reason is required")

    if body.action == "propose_time":
        if body.proposed_scheduled_at is None:
            raise AppError(400, "PROPOSED_TIME_REQUIRED", "A proposed time is required")
        settings = get_settings()
        now = dt.datetime.now(dt.UTC)
        if body.proposed_scheduled_at < now + dt.timedelta(minutes=settings.ORDER_MIN_LEAD_MIN):
            raise AppError(400, "LEAD_TIME_TOO_SHORT", "Proposed time is too soon")
        if body.proposed_scheduled_at > now + dt.timedelta(
            days=settings.ORDER_BOOKING_HORIZON_DAYS
        ):
            raise AppError(400, "OUT_OF_HORIZON", "Proposed time is beyond the booking horizon")
        if _is_weekend(body.proposed_scheduled_at, ZoneInfo(settings.COMPANY_TZ)):
            raise AppError(400, "WEEKEND_NOT_ALLOWED", "Bookings are not available on weekends")

    from_status, to_status = _TRANSITIONS[body.action]
    driver_guard = (
        or_(Order.driver_id == driver.id, Order.driver_id.is_(None))
        if body.action == "accept"
        else Order.driver_id == driver.id
    )

    # Compare-and-swap: the WHERE status=from_status clause makes two
    # concurrent accepts/double-taps safe at the SQL level without extra
    # locking — at most one of them ever affects a row.
    stmt = (
        update(Order)
        .where(Order.id == order_id, Order.status == from_status, driver_guard)
        .values(
            status=to_status,
            driver_id=driver.id if body.action == "accept" else Order.driver_id,
            updated_at=dt.datetime.now(dt.UTC),
            cancel_reason=body.reason if body.action == "reject" else Order.cancel_reason,
            cancelled_by="driver" if body.action == "reject" else Order.cancelled_by,
            proposed_scheduled_at=(
                body.proposed_scheduled_at
                if body.action == "propose_time"
                else Order.proposed_scheduled_at
            ),
        )
        .returning(Order.id)
    )
    try:
        result = await session.execute(stmt)
    except IntegrityError as e:
        await session.rollback()
        raise AppError(409, "SLOT_CONFLICT", "That slot is no longer available") from e

    updated_id = result.scalar_one_or_none()
    if updated_id is None:
        await session.rollback()
        current = await session.get(Order, order_id)
        if current is None:
            raise AppError(404, "NOT_FOUND", "Order not found")
        raise AppError(
            409,
            "INVALID_TRANSITION",
            f"Order is currently '{current.status}', cannot '{body.action}'",
        )

    session.add(
        OrderEvent(
            order_id=order_id,
            event_type=f"status_{body.action}",
            actor_id=user.id,
            payload={
                "from": from_status,
                "to": to_status,
                "reason": body.reason,
                "proposed_scheduled_at": (
                    body.proposed_scheduled_at.isoformat() if body.proposed_scheduled_at else None
                ),
            },
        )
    )
    await session.commit()

    order = await session.get(Order, order_id)

    owner_chat_id = (
        await session.execute(select(User.telegram_id).where(User.id == order.user_id))
    ).scalar_one_or_none()
    if owner_chat_id is not None:
        if body.action == "accept":
            await notify_order_accepted(owner_chat_id, order, user.full_name)
        elif body.action == "reject":
            await notify_order_cancelled(owner_chat_id, order, body.reason)
        elif body.action == "propose_time":
            await notify_order_rescheduled(owner_chat_id, order)
        elif body.action == "depart":
            await notify_driver_departed(owner_chat_id, order)

    return await serialize_order(order, session)


@router.post("/{order_id}/counter", response_model=OrderOut)
async def respond_to_counter(
    order_id: uuid.UUID,
    body: CounterResponseRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OrderOut:
    """The employee's response to a driver's proposed alternative time —
    accept (order confirmed at the new time) or decline (order cancelled;
    no further back-and-forth in this flow)."""
    order = await session.get(Order, order_id)
    if order is None or order.user_id != user.id:
        raise AppError(404, "NOT_FOUND", "Order not found")
    if order.status != "driver_countered":
        raise AppError(
            409,
            "INVALID_TRANSITION",
            f"Order is currently '{order.status}', not awaiting a response",
        )

    if body.accept:
        order.scheduled_at = order.proposed_scheduled_at
        order.proposed_scheduled_at = None
        order.status = "confirmed"
        event_type = "counter_accepted"
    else:
        order.status = "cancelled_by_user"
        order.cancel_reason = "Отклонено предложенное водителем время"
        order.cancelled_by = "user"
        order.proposed_scheduled_at = None
        event_type = "counter_declined"
    _touch(order)

    session.add(OrderEvent(order_id=order.id, event_type=event_type, actor_id=user.id, payload={}))
    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise AppError(
            409, "SLOT_CONFLICT", "That driver already has an overlapping booking"
        ) from e

    await session.refresh(order)

    if order.driver_id is not None:
        driver_chat_id = (
            await session.execute(
                select(User.telegram_id)
                .join(Driver, Driver.user_id == User.id)
                .where(Driver.id == order.driver_id)
            )
        ).scalar_one_or_none()
        if driver_chat_id is not None:
            if body.accept:
                await notify_counter_accepted(driver_chat_id, order)
            else:
                await notify_order_cancelled(
                    driver_chat_id, order, "Клиент отклонил предложенное время"
                )

    return await serialize_order(order, session)


class ApproachingOut(BaseModel):
    notified: bool


@router.post("/{order_id}/notify-approaching", response_model=ApproachingOut)
async def notify_approaching(
    order_id: uuid.UUID,
    user: User = Depends(require_role("driver", "admin")),
    session: AsyncSession = Depends(get_session),
) -> ApproachingOut:
    """A driver already en route taps this for one heads-up message —
    "5-10 minutes away" — distinct from the `arrive` transition, which
    means the driver is physically there already."""
    driver = await get_or_create_own_driver(user, session)
    if driver is None:
        raise AppError(404, "NOT_FOUND", "No driver profile for this account")

    order = await session.get(Order, order_id)
    if order is None or order.driver_id != driver.id:
        raise AppError(404, "NOT_FOUND", "Order not found")
    if order.status != "driver_en_route":
        raise AppError(409, "INVALID_TRANSITION", "Driver must be en route to notify approaching")

    owner_chat_id = (
        await session.execute(select(User.telegram_id).where(User.id == order.user_id))
    ).scalar_one_or_none()
    if owner_chat_id is None:
        return ApproachingOut(notified=False)

    await notify_driver_approaching(owner_chat_id, order)
    return ApproachingOut(notified=True)
