"""Verify that responses reduce to half-hour periods with a charge."""

from datetime import datetime
from zoneinfo import ZoneInfo

from looop_price_collector.fetcher import content_hash, day_coverage, parse_prices

JST = ZoneInfo("Asia/Tokyo")


def test_array_payload_becomes_from_to_charge() -> None:
    """Derive contiguous half-hour periods anchored to the collection date."""
    fetched_at = datetime(2026, 9, 15, 16, 0, tzinfo=JST)
    payload = {"1": {"price_data": ["12.5", 13]}}

    periods = parse_prices(payload, fetched_at)

    assert periods == [
        {
            "from": datetime(2026, 9, 15, 0, 0, tzinfo=JST),
            "to": datetime(2026, 9, 15, 0, 30, tzinfo=JST),
            "charge": 12.5,
        },
        {
            "from": datetime(2026, 9, 15, 0, 30, tzinfo=JST),
            "to": datetime(2026, 9, 15, 1, 0, tzinfo=JST),
            "charge": 13.0,
        },
    ]


def test_numbered_text_payload_is_supported() -> None:
    """Handle the alternate response shape without inventing empty periods."""
    fetched_at = datetime(2026, 9, 15, tzinfo=JST)
    payload = {"2": {"text": {"1": {"price": "8.2"}}}}

    periods = parse_prices(payload, fetched_at)

    assert len(periods) == 1
    assert periods[0]["from"] == datetime(2026, 9, 16, 0, 0, tzinfo=JST)
    assert periods[0]["charge"] == 8.2


def test_last_period_of_the_day_ends_at_midnight() -> None:
    """Close the final slot on the next day rather than at 23:30."""
    fetched_at = datetime(2026, 9, 15, tzinfo=JST)
    payload = {"1": {"price_data": [None] * 47 + [20.0]}}

    periods = parse_prices(payload, fetched_at)

    assert periods[0]["from"] == datetime(2026, 9, 15, 23, 30, tzinfo=JST)
    assert periods[0]["to"] == datetime(2026, 9, 16, 0, 0, tzinfo=JST)


def test_day_coverage_counts_each_published_day() -> None:
    """Show which of yesterday, today, and tomorrow the source published."""
    fetched_at = datetime(2026, 9, 15, 2, 0, tzinfo=JST)
    payload = {
        "0": {"price_data": [10.0]},
        "1": {"price_data": [20.0, 21.0]},
        "2": {"defrect_flg": True, "disabled_flg": True},
    }

    coverage = day_coverage(parse_prices(payload, fetched_at), fetched_at)

    assert coverage == {"yesterday": 1, "today": 2, "tomorrow": 0}


def test_content_hash_is_stable() -> None:
    """Return the same SHA-256 value for identical canonical text."""
    assert content_hash('{"a":1}') == content_hash('{"a":1}')
    assert len(content_hash("{}")) == 64
