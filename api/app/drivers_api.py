from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import Range
from sqlalchemy.ext.asyncio import AsyncSession

from api.app.deps import require_role, require_verified
from api.app.errors import AppError
from shared.db.engine import get_session
from shared.db.models import Driver, DriverSchedule, DriverTimeOff, User

router = APIRouter(prefix="/v1/drivers", tags=["drivers"])


class DriverOut(BaseModel):
    id: uuid.UUID
    full_name: str | None
    car_model: str | None
    car_plate: str | None
    car_color: str | None
    is_active: bool
    on_duty: bool


class ScheduleWindow(BaseModel):
    weekday: int = Field(ge=0, le=6)
    start_time: dt.time
    end_time: dt.time

    @model_validator(mode="after")
    def _check_order(self) -> ScheduleWindow:
        if self.start_time >= self.end_time:
            raise ValueError("start_time must be before end_time")
        return self


class ScheduleOut(BaseModel):
    id: uuid.UUID
    weekday: int
    start_time: dt.time
    end_time: dt.time


class TimeOffRequest(BaseModel):
    starts_at: dt.datetime
    ends_at: dt.datetime
    reason: str | None = None

    @model_validator(mode="after")
    def _check_order(self) -> TimeOffRequest:
        if self.starts_at >= self.ends_at:
            raise ValueError("starts_at must be before ends_at")
        return self


class TimeOffOut(BaseModel):
    id: uuid.UUID
    starts_at: dt.datetime
    ends_at: dt.datetime
    reason: str | None


class SetDutyRequest(BaseModel):
    on_duty: bool


async def _own_driver(user: User, session: AsyncSession) -> Driver:
    driver = (
        await session.execute(select(Driver).where(Driver.user_id == user.id))
    ).scalar_one_or_none()
    if driver is None:
        raise AppError(404, "NOT_FOUND", "No driver profile for this account")
    return driver


@router.get("", response_model=list[DriverOut])
async def list_drivers(
    _user: User = Depends(require_verified),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    result = await session.execute(
        select(Driver, User.full_name)
        .join(User, User.id == Driver.user_id)
        .where(Driver.is_active.is_(True))
        .order_by(User.full_name)
    )
    return [
        {
            "id": driver.id,
            "full_name": full_name,
            "car_model": driver.car_model,
            "car_plate": driver.car_plate,
            "car_color": driver.car_color,
            "is_active": driver.is_active,
            "on_duty": driver.on_duty,
        }
        for driver, full_name in result.all()
    ]


@router.get("/me", response_model=DriverOut)
async def get_my_driver_profile(
    user: User = Depends(require_role("driver")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    driver = await _own_driver(user, session)
    return {
        "id": driver.id,
        "full_name": user.full_name,
        "car_model": driver.car_model,
        "car_plate": driver.car_plate,
        "car_color": driver.car_color,
        "is_active": driver.is_active,
        "on_duty": driver.on_duty,
    }


@router.get("/me/schedule", response_model=list[ScheduleOut])
async def get_my_schedule(
    user: User = Depends(require_role("driver")),
    session: AsyncSession = Depends(get_session),
) -> list[DriverSchedule]:
    driver = await _own_driver(user, session)
    result = await session.execute(
        select(DriverSchedule)
        .where(DriverSchedule.driver_id == driver.id)
        .order_by(DriverSchedule.weekday, DriverSchedule.start_time)
    )
    return list(result.scalars().all())


@router.put("/me/schedule", response_model=list[ScheduleOut])
async def set_my_schedule(
    body: list[ScheduleWindow],
    user: User = Depends(require_role("driver")),
    session: AsyncSession = Depends(get_session),
) -> list[DriverSchedule]:
    driver = await _own_driver(user, session)

    by_weekday: dict[int, list[ScheduleWindow]] = {}
    for window in body:
        by_weekday.setdefault(window.weekday, []).append(window)
    for weekday, windows in by_weekday.items():
        windows.sort(key=lambda w: w.start_time)
        for prev, cur in zip(windows, windows[1:], strict=False):
            if cur.start_time < prev.end_time:
                raise AppError(400, "SCHEDULE_OVERLAP", f"Overlapping windows on weekday {weekday}")

    await session.execute(
        DriverSchedule.__table__.delete().where(DriverSchedule.driver_id == driver.id)
    )
    rows = [
        DriverSchedule(
            driver_id=driver.id,
            weekday=w.weekday,
            start_time=w.start_time,
            end_time=w.end_time,
        )
        for w in body
    ]
    session.add_all(rows)
    await session.commit()
    for row in rows:
        await session.refresh(row)
    return rows


@router.post("/me/time-off", status_code=201, response_model=TimeOffOut)
async def add_time_off(
    body: TimeOffRequest,
    user: User = Depends(require_role("driver")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    driver = await _own_driver(user, session)
    time_off = DriverTimeOff(
        driver_id=driver.id,
        period=Range(body.starts_at, body.ends_at),
        reason=body.reason,
    )
    session.add(time_off)
    await session.commit()
    await session.refresh(time_off)
    return {
        "id": time_off.id,
        "starts_at": time_off.period.lower,
        "ends_at": time_off.period.upper,
        "reason": time_off.reason,
    }


@router.delete("/me/time-off/{time_off_id}", status_code=204, response_model=None)
async def delete_time_off(
    time_off_id: uuid.UUID,
    user: User = Depends(require_role("driver")),
    session: AsyncSession = Depends(get_session),
) -> None:
    driver = await _own_driver(user, session)
    time_off = await session.get(DriverTimeOff, time_off_id)
    if time_off is None or time_off.driver_id != driver.id:
        raise AppError(404, "NOT_FOUND", "Time-off entry not found")
    await session.delete(time_off)
    await session.commit()


@router.patch("/me/duty", response_model=dict)
async def set_duty(
    body: SetDutyRequest,
    user: User = Depends(require_role("driver")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    driver = await _own_driver(user, session)
    driver.on_duty = body.on_duty
    await session.commit()
    return {"on_duty": driver.on_duty}
