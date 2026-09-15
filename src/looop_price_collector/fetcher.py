"""Fetch source payloads and reduce them to half-hour price periods."""

from __future__ import annotations

from datetime import datetime, time, timedelta
import hashlib
import json
from typing import Any
from zoneinfo import ZoneInfo

import httpx

# Every datetime leaving this module is aware and set to Japan Standard Time,
# which is the zone the source publishes its prices in.
JST = ZoneInfo("Asia/Tokyo")
SLOTS_PER_DAY = 48
SLOT_MINUTES = 30

# The response labels its days relative to the request, without any dates, so
# the collection date is the only available anchor.
DAY_OFFSETS = {"0": -1, "1": 0, "2": 1}
DAY_NAMES = {-1: "yesterday", 0: "today", 1: "tomorrow"}


def fetch_prices(
    api_url: str, area_code: str, timeout_seconds: float
) -> tuple[datetime, str, dict[str, Any]]:
    """Request one area and return its timestamp, canonical JSON, and payload."""
    fetched_at = datetime.now(JST)
    response = httpx.get(
        api_url,
        params={"select_area": area_code},
        timeout=timeout_seconds,
        headers={
            "Accept": "application/json",
            "User-Agent": "looop-price-warehouse/0.1 (+data collection)",
        },
        follow_redirects=True,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("The source response must be a JSON object")
    raw_json = json.dumps(
        payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    )
    return fetched_at, raw_json, payload


def content_hash(raw_json: str) -> str:
    """Create a stable digest used to identify unchanged source responses."""
    return hashlib.sha256(raw_json.encode("utf-8")).hexdigest()


def _day_charges(day: dict[str, Any]) -> list[Any]:
    """Read one day's charges from whichever shape the source used."""
    charges = day.get("price_data")
    if isinstance(charges, list):
        return charges
    # The source sometimes carries a day as numbered text entries keyed "1".."48"
    # instead of a list, so the slots are read one by one in that case.
    text = day.get("text") or {}
    return [
        (text.get(str(index)) or {}).get("price")
        for index in range(1, SLOTS_PER_DAY + 1)
    ]


def parse_prices(
    payload: dict[str, Any], fetched_at: datetime
) -> list[dict[str, Any]]:
    """Turn the payload into sorted half-hour periods with their charge."""
    base_date = fetched_at.astimezone(JST).date()
    periods: list[dict[str, Any]] = []

    for day_key, offset_days in DAY_OFFSETS.items():
        day = payload.get(day_key)
        if not isinstance(day, dict):
            continue

        start_of_day = datetime.combine(
            base_date + timedelta(days=offset_days), time.min, tzinfo=JST
        )
        for slot_index, charge in enumerate(_day_charges(day)[:SLOTS_PER_DAY]):
            if charge is None:
                continue
            valid_from = start_of_day + timedelta(minutes=SLOT_MINUTES * slot_index)
            periods.append(
                {
                    "from": valid_from,
                    "to": valid_from + timedelta(minutes=SLOT_MINUTES),
                    "charge": float(charge),
                }
            )

    periods.sort(key=lambda period: period["from"])
    return periods


def day_coverage(
    periods: list[dict[str, Any]], fetched_at: datetime
) -> dict[str, int]:
    """Report how many periods arrived for yesterday, today, and tomorrow."""
    base_date = fetched_at.astimezone(JST).date()
    counts = {name: 0 for name in DAY_NAMES.values()}
    for period in periods:
        offset = (period["from"].astimezone(JST).date() - base_date).days
        name = DAY_NAMES.get(offset)
        if name:
            counts[name] += 1
    return counts
