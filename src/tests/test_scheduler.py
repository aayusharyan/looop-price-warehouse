"""Verify the in-container daily schedule and its stop behaviour."""

from datetime import datetime, time
import threading
from zoneinfo import ZoneInfo

import pytest

from looop_price_collector.scheduler import next_run_at, parse_schedule, serve

JST = ZoneInfo("Asia/Tokyo")


def test_schedule_is_sorted_and_deduplicated() -> None:
    """Accept operator-formatted lists without trusting their order."""
    assert parse_schedule("17:15, 16:15,16:15") == (time(16, 15), time(17, 15))


@pytest.mark.parametrize("value", ["", "1615", "25:00", "16:xx"])
def test_malformed_schedule_is_rejected(value: str) -> None:
    """Fail at startup rather than silently never collecting."""
    with pytest.raises(ValueError):
        parse_schedule(value)


def test_next_run_picks_the_following_time_today() -> None:
    """Move to the next remaining time on the same day."""
    schedule = parse_schedule("16:15,17:15")

    following = next_run_at(schedule, datetime(2026, 9, 15, 16, 30, tzinfo=JST))

    assert following == datetime(2026, 9, 15, 17, 15, tzinfo=JST)


def test_next_run_rolls_over_to_tomorrow() -> None:
    """Wrap to the first time of the next day once the day's times have passed."""
    schedule = parse_schedule("16:15,17:15")

    following = next_run_at(schedule, datetime(2026, 9, 15, 23, 50, tzinfo=JST))

    assert following == datetime(2026, 9, 16, 16, 15, tzinfo=JST)


def test_serve_collects_on_start_then_stops_on_signal() -> None:
    """Collect immediately, then end the loop as soon as a stop is requested."""
    stop_event = threading.Event()
    runs = []

    def run_once() -> None:
        runs.append(datetime(2026, 9, 15, 16, 15, tzinfo=JST))
        stop_event.set()

    serve(parse_schedule("16:15"), run_once, True, stop_event)

    assert len(runs) == 1


def test_serve_keeps_running_after_a_failed_collection() -> None:
    """Survive a transient source failure instead of exiting the container."""
    stop_event = threading.Event()
    attempts = []

    def run_once() -> None:
        attempts.append(1)
        stop_event.set()
        raise RuntimeError("the source is unreachable")

    serve(parse_schedule("16:15"), run_once, True, stop_event)

    assert attempts == [1]
