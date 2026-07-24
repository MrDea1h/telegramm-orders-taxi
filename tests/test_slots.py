import datetime as dt
from zoneinfo import ZoneInfo

from shared.slots import compute_slot_grid, compute_slots

TZ = ZoneInfo("Europe/Moscow")
DATE = dt.date(2026, 8, 3)  # a Monday, far enough in the future to ignore lead-time in most cases
FAR_PAST_NOW = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)


def _local(hour: int, minute: int = 0) -> dt.datetime:
    return dt.datetime.combine(DATE, dt.time(hour, minute), tzinfo=TZ).astimezone(dt.UTC)


def test_basic_window_generates_expected_slot_count():
    slots = compute_slots(
        date=DATE,
        schedule_windows=[(dt.time(9, 0), dt.time(12, 0))],
        busy_ranges=[],
        duration_min=30,
        buffer_min=15,
        step_min=30,
        min_lead_min=30,
        now=FAR_PAST_NOW,
        tz=TZ,
    )
    # Window is 3h = 180min; each slot occupies 45min (duration+buffer) and
    # starts are on a 30min grid: 09:00, 09:30, 10:00, 10:30, 11:00, 11:15
    # is not on-grid so last valid start is 11:00 (11:00+45min=11:45<=12:00);
    # 11:30 would end at 12:15 > 12:00, so it's excluded.
    assert slots == [_local(9, 0), _local(9, 30), _local(10, 0), _local(10, 30), _local(11, 0)]


def test_busy_range_removes_overlapping_slots():
    busy_start = _local(10, 0)
    busy_end = busy_start + dt.timedelta(minutes=45)
    slots = compute_slots(
        date=DATE,
        schedule_windows=[(dt.time(9, 0), dt.time(12, 0))],
        busy_ranges=[(busy_start, busy_end)],
        duration_min=30,
        buffer_min=15,
        step_min=30,
        min_lead_min=30,
        now=FAR_PAST_NOW,
        tz=TZ,
    )
    # busy range is [10:00,10:45). 09:30 occupies [09:30,10:15) -> overlaps;
    # 10:00 occupies [10:00,10:45) -> overlaps; 10:30 occupies [10:30,11:15)
    # -> still overlaps (10:30 < 10:45); 09:00 and 11:00 are clear.
    assert _local(9, 0) in slots
    assert _local(9, 30) not in slots
    assert _local(10, 0) not in slots
    assert _local(10, 30) not in slots
    assert _local(11, 0) in slots


def test_min_lead_excludes_near_term_slots():
    now = _local(9, 20)
    slots = compute_slots(
        date=DATE,
        schedule_windows=[(dt.time(9, 0), dt.time(12, 0))],
        busy_ranges=[],
        duration_min=30,
        buffer_min=15,
        step_min=30,
        min_lead_min=30,
        now=now,
        tz=TZ,
    )
    # earliest allowed start is now+30min = 09:50 -> 10:00 is the first slot
    assert _local(9, 0) not in slots
    assert _local(9, 30) not in slots
    assert _local(10, 0) in slots


def test_no_schedule_window_yields_no_slots():
    slots = compute_slots(
        date=DATE,
        schedule_windows=[],
        busy_ranges=[],
        duration_min=30,
        buffer_min=15,
        step_min=30,
        min_lead_min=30,
        now=FAR_PAST_NOW,
        tz=TZ,
    )
    assert slots == []


def test_multiple_windows_same_day_both_contribute():
    slots = compute_slots(
        date=DATE,
        schedule_windows=[(dt.time(9, 0), dt.time(10, 0)), (dt.time(14, 0), dt.time(15, 0))],
        busy_ranges=[],
        duration_min=30,
        buffer_min=15,
        step_min=30,
        min_lead_min=30,
        now=FAR_PAST_NOW,
        tz=TZ,
    )
    assert _local(9, 0) in slots
    assert _local(14, 0) in slots


def test_occupied_span_must_fit_entirely_before_window_end():
    # window is exactly 45min (09:00-09:45) — one 30min-ride+15min-buffer
    # slot fits at 09:00 but nothing else does.
    slots = compute_slots(
        date=DATE,
        schedule_windows=[(dt.time(9, 0), dt.time(9, 45))],
        busy_ranges=[],
        duration_min=30,
        buffer_min=15,
        step_min=30,
        min_lead_min=30,
        now=FAR_PAST_NOW,
        tz=TZ,
    )
    assert slots == [_local(9, 0)]


def test_grid_includes_taken_slots_as_unavailable_not_omitted():
    busy_start = _local(10, 0)
    busy_end = busy_start + dt.timedelta(minutes=45)
    grid = compute_slot_grid(
        date=DATE,
        schedule_windows=[(dt.time(9, 0), dt.time(12, 0))],
        busy_ranges=[(busy_start, busy_end)],
        duration_min=30,
        buffer_min=15,
        step_min=30,
        min_lead_min=30,
        now=FAR_PAST_NOW,
        tz=TZ,
    )
    as_dict = dict(grid)
    # Same candidates as test_busy_range_removes_overlapping_slots, but here
    # the busy ones must still be present in the grid — just flagged
    # unavailable — instead of missing entirely.
    assert as_dict[_local(9, 0)] is True
    assert as_dict[_local(9, 30)] is False
    assert as_dict[_local(10, 0)] is False
    assert as_dict[_local(10, 30)] is False
    assert as_dict[_local(11, 0)] is True

    # compute_slots stays the available-only view over the same grid.
    available_only = compute_slots(
        date=DATE,
        schedule_windows=[(dt.time(9, 0), dt.time(12, 0))],
        busy_ranges=[(busy_start, busy_end)],
        duration_min=30,
        buffer_min=15,
        step_min=30,
        min_lead_min=30,
        now=FAR_PAST_NOW,
        tz=TZ,
    )
    assert available_only == [t for t, available in grid if available]
