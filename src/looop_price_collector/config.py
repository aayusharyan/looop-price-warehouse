"""Load and validate runtime settings from environment variables."""

from dataclasses import dataclass, field
from datetime import time
import os
from pathlib import Path

from .areas import ALL_AREA_CODES
from .db import parse_database_url
from .scheduler import parse_schedule


def environment_flag(name: str, default: bool) -> bool:
    """Read a common boolean spelling and reject ambiguous values."""
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be true or false, got {value!r}")


def configured_area_codes() -> tuple[str, ...]:
    """Read the comma-separated area list, defaulting to every area."""
    configured = os.getenv("LOOOP_AREA_CODES")
    if configured is None:
        return ALL_AREA_CODES
    return tuple(code.strip() for code in configured.split(",") if code.strip())


@dataclass(frozen=True)
class Config:
    """Represent validated collector, file-storage, and database settings."""

    area_codes: tuple[str, ...] = field(default_factory=configured_area_codes)
    api_url: str = field(
        default_factory=lambda: os.getenv(
            "LOOOP_API_URL", "https://looop-denki.com/api/prices"
        )
    )
    timeout_seconds: float = field(
        default_factory=lambda: float(os.getenv("HTTP_TIMEOUT_SECONDS", "20"))
    )
    json_storage_enabled: bool = field(
        default_factory=lambda: environment_flag("JSON_STORAGE_ENABLED", True)
    )
    json_data_dir: Path = field(
        default_factory=lambda: Path(os.getenv("JSON_DATA_DIR", "./data"))
    )
    database_url: str | None = field(
        default_factory=lambda: os.getenv("DATABASE_URL") or None
    )
    raw_cache_enabled: bool = field(
        default_factory=lambda: environment_flag("RAW_CACHE_ENABLED", True)
    )
    raw_cache_dir: Path = field(
        default_factory=lambda: Path(os.getenv("RAW_CACHE_DIR", "./raw-cache"))
    )
    raw_cache_max_files: int = field(
        default_factory=lambda: int(os.getenv("RAW_CACHE_MAX_FILES", "10"))
    )
    schedule: tuple[time, ...] = field(
        default_factory=lambda: parse_schedule(
            os.getenv("COLLECT_SCHEDULE", "00:20,04:20,08:20,12:20,16:20,20:20")
        )
    )
    collect_on_start: bool = field(
        default_factory=lambda: environment_flag("COLLECT_ON_START", True)
    )

    def validate(self) -> None:
        """Ensure at least one destination exists and basic values are safe."""
        if not self.json_storage_enabled and not self.database_url:
            raise ValueError(
                "No storage enabled: enable JSON_STORAGE_ENABLED or set DATABASE_URL"
            )
        # Parsed here so an unusable URL stops the run before the first fetch
        # instead of after prices have already been collected.
        if self.database_url:
            parse_database_url(self.database_url)
        if not self.area_codes:
            raise ValueError("At least one area code must be configured")
        unsupported = sorted(set(self.area_codes) - set(ALL_AREA_CODES))
        if unsupported:
            raise ValueError(f"Unsupported area codes: {', '.join(unsupported)}")
        if len(set(self.area_codes)) != len(self.area_codes):
            raise ValueError("Area codes must not contain duplicates")
        if self.timeout_seconds <= 0:
            raise ValueError("HTTP_TIMEOUT_SECONDS must be greater than zero")
        if self.raw_cache_max_files < 1:
            raise ValueError("RAW_CACHE_MAX_FILES must be at least one")
