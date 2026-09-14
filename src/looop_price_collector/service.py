"""Orchestrate one collection and fan its result out to enabled stores."""

import logging
from typing import Any

from .config import Config
from .db import store_in_database
from .fetcher import content_hash, day_coverage, fetch_prices, parse_prices
from .json_store import store_prices
from .raw_cache import store_raw

LOGGER = logging.getLogger(__name__)


def collect_area(config: Config, area_code: str) -> dict[str, Any]:
    """Fetch one area, reduce it to periods, and update every destination."""
    fetched_at, raw_json, payload = fetch_prices(
        config.api_url, area_code, config.timeout_seconds
    )
    periods = parse_prices(payload, fetched_at)
    source_url = f"{config.api_url}?select_area={area_code}"
    stores: dict[str, dict[str, Any]] = {}

    if config.json_storage_enabled:
        stores["data"] = store_prices(
            config.json_data_dir, fetched_at, area_code, source_url, periods
        )
        for correction in stores["data"]["corrections"]:
            LOGGER.error(
                "Area %s delivery date %s changed in %d periods; "
                "the file was updated with the newest values",
                area_code,
                correction["date"],
                len(correction["differences"]),
            )

    if config.raw_cache_enabled:
        stores["raw_cache"] = store_raw(
            config.raw_cache_dir,
            fetched_at,
            area_code,
            source_url,
            content_hash(raw_json),
            payload,
            config.raw_cache_max_files,
        )

    if config.database_url:
        stores["database"] = store_in_database(
            config.database_url, fetched_at, area_code, periods
        )

    statuses = {store["status"] for store in stores.values()}
    return {
        "status": (
            "corrected"
            if "corrected" in statuses
            else "stored"
            if "stored" in statuses
            else "unchanged"
        ),
        "fetched_at": fetched_at.isoformat(),
        "periods": len(periods),
        "days": day_coverage(periods, fetched_at),
        "stores": stores,
    }


def collect(config: Config) -> dict[str, Any]:
    """Collect every configured area and summarize their independent results."""
    config.validate()
    areas = {code: collect_area(config, code) for code in config.area_codes}
    # Collected into one list so a caller can fail the run without walking
    # every area's individual stores.
    corrections = [
        {"area": code, **correction}
        for code, result in areas.items()
        for correction in result["stores"].get("data", {}).get("corrections", [])
    ]
    statuses = {result["status"] for result in areas.values()}
    return {
        "status": (
            "corrected"
            if corrections
            else "stored"
            if "stored" in statuses
            else "unchanged"
        ),
        "area_count": len(areas),
        "periods": sum(result["periods"] for result in areas.values()),
        "corrections": corrections,
        "areas": areas,
    }
