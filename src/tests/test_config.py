"""Verify defensive parsing and validation of runtime configuration."""

import pytest

from looop_price_collector.areas import ALL_AREA_CODES
from looop_price_collector.config import Config, configured_area_codes, environment_flag


def test_environment_flag_accepts_common_values(monkeypatch) -> None:
    """Map operator-friendly boolean spellings to Python booleans."""
    monkeypatch.setenv("FEATURE", "yes")
    assert environment_flag("FEATURE", False) is True
    monkeypatch.setenv("FEATURE", "OFF")
    assert environment_flag("FEATURE", True) is False


def test_configuration_rejects_no_storage() -> None:
    """Prevent collection when all durable destinations are disabled."""
    with pytest.raises(ValueError, match="No storage enabled"):
        Config(json_storage_enabled=False, database_url=None).validate()


def test_configuration_rejects_a_non_postgresql_url() -> None:
    """Fail before collecting when the URL points at an unsupported backend."""
    with pytest.raises(ValueError, match="must be a PostgreSQL URL"):
        Config(database_url="mysql://user:password@host:3306/looop").validate()


def test_all_areas_are_enabled_by_default(monkeypatch) -> None:
    """Collect every supported region when no area override is provided."""
    monkeypatch.delenv("LOOOP_AREA_CODES", raising=False)
    assert configured_area_codes() == ALL_AREA_CODES


def test_comma_separated_area_override(monkeypatch) -> None:
    """Allow operators to select several areas without changing the code."""
    monkeypatch.setenv("LOOOP_AREA_CODES", "01, 03,10")
    assert configured_area_codes() == ("01", "03", "10")
