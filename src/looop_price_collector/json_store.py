"""Write one price file per delivery date and detect source revisions."""

from datetime import datetime
import json
import os
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .areas import AREA_NAMES

JST = ZoneInfo("Asia/Tokyo")

# Written once into each area directory so a reader of the stored files knows
# what they hold without opening the collector.
AREA_README = """# {area_name}

Area code: `{area_code}`

One file per delivery day, named by the Japan Standard Time date its prices apply to: `YYYY-MM-DD.json`.

Every entry in `prices` is one half-hour period:

- `from`: start of the period
- `to`: end of the period
- `charge`: price in JPY per kWh

Each file contains only that date's periods. A later collection checks its values against the existing file and replaces it if the source revised a charge.

The untouched source responses are not kept here. The most recent ones live in `raw-cache/area-{area_code}/`.

Source: `{source_url}`
"""


def area_dir(data_dir: Path, area_code: str) -> Path:
    """Return the directory that holds one area's price files."""
    return data_dir / f"area-{area_code}"


def daily_price_path(data_dir: Path, area_code: str, delivery_date: str) -> Path:
    """Name each file after the delivery date represented by its prices."""
    return area_dir(data_dir, area_code) / f"{delivery_date}.json"


def write_area_readme(data_dir: Path, area_code: str, source_url: str) -> None:
    """Create the per-area README once so each directory explains itself."""
    path = area_dir(data_dir, area_code) / "README.md"
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        AREA_README.format(
            area_code=area_code,
            area_name=AREA_NAMES[area_code],
            source_url=source_url,
        ),
        encoding="utf-8",
    )


def _serialize(periods: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Render periods as portable ISO 8601 strings with a plain charge."""
    return [
        {
            "from": period["from"].isoformat(),
            "to": period["to"].isoformat(),
            "charge": period["charge"],
        }
        for period in periods
    ]


def write_atomically(path: Path, document: dict[str, Any]) -> None:
    """Write beside the target and rename, so readers never see half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(".json.tmp")
    temporary_path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(temporary_path, path)


def compare_prices(
    existing: list[dict[str, Any]], incoming: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Describe changed, added, or removed periods before replacing a day."""
    old_by_start = {price["from"]: price for price in existing}
    new_by_start = {price["from"]: price for price in incoming}
    differences = []
    for period_start in sorted(set(old_by_start) | set(new_by_start)):
        old = old_by_start.get(period_start)
        new = new_by_start.get(period_start)
        if old != new:
            differences.append(
                {
                    "from": period_start,
                    "existing_charge": old.get("charge") if old else None,
                    "incoming_charge": new.get("charge") if new else None,
                }
            )
    return differences


def store_delivery_day(
    data_dir: Path,
    fetched_at: datetime,
    area_code: str,
    source_url: str,
    periods: list[dict[str, Any]],
) -> dict[str, Any]:
    """Cross-check and store one delivery date using the newest source truth."""
    prices = _serialize(periods)
    delivery_date = periods[0]["from"].astimezone(JST).date().isoformat()
    path = daily_price_path(data_dir, area_code, delivery_date)
    differences: list[dict[str, Any]] = []

    if path.exists():
        existing = json.loads(path.read_text(encoding="utf-8"))
        differences = compare_prices(existing.get("prices", []), prices)
        if not differences:
            return {
                "status": "unchanged",
                "date": delivery_date,
                "path": str(path),
                "periods": len(prices),
                "differences": [],
            }

    write_area_readme(data_dir, area_code, source_url)
    write_atomically(
        path,
        {
            "area": area_code,
            "area_name": AREA_NAMES[area_code],
            "fetched_at": fetched_at.isoformat(),
            "source": source_url,
            "prices": prices,
        },
    )
    return {
        "status": "corrected" if differences else "stored",
        "date": delivery_date,
        "path": str(path),
        "periods": len(prices),
        "differences": differences,
    }


def store_prices(
    data_dir: Path,
    fetched_at: datetime,
    area_code: str,
    source_url: str,
    periods: list[dict[str, Any]],
) -> dict[str, Any]:
    """Split a response by delivery date, validating each existing date first."""
    by_date: dict[str, list[dict[str, Any]]] = {}
    for period in periods:
        delivery_date = period["from"].astimezone(JST).date().isoformat()
        by_date.setdefault(delivery_date, []).append(period)

    files = [
        store_delivery_day(
            data_dir,
            fetched_at,
            area_code,
            source_url,
            sorted(day_periods, key=lambda period: period["from"]),
        )
        for _, day_periods in sorted(by_date.items())
    ]
    corrections = [
        {"date": result["date"], "differences": result["differences"]}
        for result in files
        if result["status"] == "corrected"
    ]
    statuses = {result["status"] for result in files}
    return {
        "status": (
            "corrected"
            if "corrected" in statuses
            else "stored"
            if "stored" in statuses
            else "unchanged"
        ),
        "periods": len(periods),
        "files": files,
        "corrections": corrections,
    }


def price_file_paths(data_dir: Path, area_code: str) -> list[Path]:
    """List an area's price files in collection order, oldest first."""
    return sorted(area_dir(data_dir, area_code).glob("[0-9]*-[0-9]*-[0-9]*.json"))


def load_price_files(data_dir: Path, area_code: str) -> list[dict[str, Any]]:
    """Read every stored price file for an area in collection order."""
    documents = []
    for path in price_file_paths(data_dir, area_code):
        document = json.loads(path.read_text(encoding="utf-8"))
        document["source_file"] = path.name
        documents.append(document)
    return documents


def latest_prices(data_dir: Path, area_code: str, limit: int) -> list[dict[str, Any]]:
    """Return the most recently published charge for the newest periods."""
    by_period: dict[str, dict[str, Any]] = {}

    # Newest files are visited first, so a repeated period keeps the charge
    # from the most recent collection.
    for path in reversed(price_file_paths(data_dir, area_code)):
        document = json.loads(path.read_text(encoding="utf-8"))
        for price in reversed(document.get("prices", [])):
            by_period.setdefault(price["from"], price)
        if len(by_period) >= limit:
            break

    periods = sorted(by_period.values(), key=lambda price: price["from"])
    return periods[-limit:]
