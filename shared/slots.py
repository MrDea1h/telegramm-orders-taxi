"""Pure slot-availability computation — no DB session, no I/O, so this is
directly unit-testable with plain in-memory fixtures. The API layer
(api/app/orders_api.py) fetches DriverSchedule/DriverTimeOff/Order rows,
converts them into the plain tuples this module expects, and calls
`compute_slots` once per candidate driver.

This is inherently advisory: it makes the wizard's slot picker usable, but
the actual source of truth against double-booking is the DB's
excl_orders_driver_overlap EXCLUDE constraint (see migration 0001) plus the
compare-and-swap UPDATE used by the driver-accept transition.
"""

from __future__ import annotations

import datetime as dt


def compute_slots(
    *,
    date: dt.date,
    schedule_windows: list[tuple[dt.time, dt.time]],
    busy_ranges: list[tuple[dt.datetime, dt.datetime]],
    duration_min: int,
    buffer_min: int,
    step_min: int,
    min_lead_min: int,
    now: dt.datetime,
    tz: dt.tzinfo,
) -> list[dt.datetime]:
    """Available UTC-aware slot-start times for one driver on one calendar
    day (`date`, interpreted in `tz`).

    `busy_ranges` already includes both DriverTimeOff periods and existing
    orders' occupied spans (scheduled_at .. scheduled_at + duration + buffer)
    — both are "don't book here" UTC ranges of identical shape, so the
    caller folds them into one list before calling this.
    """
    occupied_span = dt.timedelta(minutes=duration_min + buffer_min)
    step = dt.timedelta(minutes=step_min)
    earliest = now + dt.timedelta(minutes=min_lead_min)

    slots: list[dt.datetime] = []
    for start_time, end_time in schedule_windows:
        window_start = dt.datetime.combine(date, start_time, tzinfo=tz)
        window_end = dt.datetime.combine(date, end_time, tzinfo=tz)

        candidate = window_start
        while candidate + occupied_span <= window_end:
            candidate_start = candidate.astimezone(dt.UTC)
            candidate_end = candidate_start + occupied_span
            if candidate_start >= earliest and not _overlaps_any(
                candidate_start, candidate_end, busy_ranges
            ):
                slots.append(candidate_start)
            candidate += step

    return slots


def _overlaps_any(
    start: dt.datetime, end: dt.datetime, ranges: list[tuple[dt.datetime, dt.datetime]]
) -> bool:
    return any(start < r_end and end > r_start for r_start, r_end in ranges)
