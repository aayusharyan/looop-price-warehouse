"""Keep a short rolling window of untouched responses for validation."""

from datetime import datetime
import json
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .json_store import write_atomically

JST = ZoneInfo("Asia/Tokyo")


def area_dir(cache_dir: Path, area_code: str) -> Path:
    """Return the directory holding one area's cached responses."""
    return cache_dir / f"area-{area_code}"


def cached_paths(cache_dir: Path, area_code: str) -> list[Path]:
    """List an area's cached responses in collection order, oldest first."""
    return sorted(area_dir(cache_dir, area_code).glob("[0-9]*-[0-9]*-[0-9]*.json"))


def prune(cache_dir: Path, area_code: str, max_files: int) -> list[str]:
    """Delete the oldest responses so only the newest `max_files` remain."""
    paths = cached_paths(cache_dir, area_code)
    removed = []
    for path in paths[: max(len(paths) - max_files, 0)]:
        path.unlink()
        removed.append(path.name)
    return removed


def store_raw(
    cache_dir: Path,
    fetched_at: datetime,
    area_code: str,
    source_url: str,
    digest: str,
    payload: dict[str, Any],
    max_files: int,
) -> dict[str, Any]:
    """Cache one response for the day, then trim the window back to the cap."""
    path = area_dir(cache_dir, area_code) / f"{fetched_at.astimezone(JST).date()}.json"
    status = "stored"

    if path.exists():
        existing = json.loads(path.read_text(encoding="utf-8"))
        if existing.get("content_sha256") == digest:
            status = "unchanged"

    if status == "stored":
        write_atomically(
            path,
            {
                "area": area_code,
                "fetched_at": fetched_at.isoformat(),
                "source": source_url,
                "content_sha256": digest,
                "raw": payload,
            },
        )

    removed = prune(cache_dir, area_code, max_files)
    return {
        "status": status,
        "path": str(path),
        "retained": len(cached_paths(cache_dir, area_code)),
        "removed": removed,
    }
