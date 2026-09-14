"""Repeat collections on a daily schedule inside a long-lived container."""

from datetime import datetime, time, timedelta
import logging
import threading
from typing import Callable
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")
LOGGER = logging.getLogger(__name__)


def parse_schedule(value: str) -> tuple[time, ...]:
    """Read comma-separated `HH:MM` times, rejecting anything malformed."""
    scheduled_times = []
    for entry in value.split(","):
        entry = entry.strip()
        if not entry:
            continue
        hour, separator, minute = entry.partition(":")
        if not separator:
            raise ValueError(f"Invalid schedule time {entry!r}; expected HH:MM")
        try:
            scheduled_times.append(time(int(hour), int(minute)))
        except ValueError as error:
            raise ValueError(
                f"Invalid schedule time {entry!r}; expected HH:MM"
            ) from error
    if not scheduled_times:
        raise ValueError("At least one schedule time is required")
    return tuple(sorted(set(scheduled_times)))


def next_run_at(schedule: tuple[time, ...], now: datetime) -> datetime:
    """Find the next scheduled moment after `now`, rolling over at midnight."""
    today = now.astimezone(JST)
    for scheduled in schedule:
        candidate = datetime.combine(today.date(), scheduled, tzinfo=JST)
        if candidate > today:
            return candidate
    return datetime.combine(today.date() + timedelta(days=1), schedule[0], tzinfo=JST)


def run_guarded(run_once: Callable[[], None]) -> None:
    """Log a failed collection instead of letting it stop the schedule."""
    try:
        run_once()
    except Exception:
        LOGGER.exception("Scheduled collection failed; staying on schedule")


def serve(
    schedule: tuple[time, ...],
    run_once: Callable[[], None],
    collect_on_start: bool = True,
    stop_event: threading.Event | None = None,
    clock: Callable[[], datetime] | None = None,
) -> None:
    """Collect on each scheduled time until asked to stop."""
    stop_event = stop_event or threading.Event()
    clock = clock or (lambda: datetime.now(JST))

    if collect_on_start:
        run_guarded(run_once)

    while not stop_event.is_set():
        scheduled_at = next_run_at(schedule, clock())
        LOGGER.info("Next collection at %s", scheduled_at.isoformat())
        delay = (scheduled_at - clock()).total_seconds()
        # Waiting on the event rather than sleeping lets a stop signal end the
        # container immediately instead of hours later.
        if stop_event.wait(max(delay, 0.0)):
            break
        run_guarded(run_once)

    LOGGER.info("Scheduler stopped")
