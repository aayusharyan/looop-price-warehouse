"""Verify plain price files, the rolling raw cache, and SQL fan-out."""

from collections.abc import Iterator
from datetime import datetime, timedelta
import json
import os
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL

from looop_price_collector import db, service
from looop_price_collector.config import Config
from looop_price_collector.db import (
    parse_database_url,
    store_in_database,
    stored_from_database,
)
from looop_price_collector.json_store import store_prices, stored_prices
from looop_price_collector.raw_cache import cached_paths, store_raw

JST = ZoneInfo("Asia/Tokyo")


def release_engines() -> None:
    """Close pooled connections that would otherwise block dropping a database."""
    for engine in db.ENGINES.values():
        engine.dispose()
    db.ENGINES.clear()


def drop_database(url: URL) -> None:
    """Remove the test database through a login to the maintenance database."""
    engine = create_engine(
        url.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    with engine.connect() as connection:
        name = engine.dialect.identifier_preparer.quote(url.database)
        connection.execute(text(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)"))
    engine.dispose()


@pytest.fixture
def database_url() -> Iterator[str]:
    """Name a database the server does not hold yet, so tests see it built."""
    configured = os.getenv("LOOOP_TEST_DATABASE_URL")
    if not configured:
        pytest.skip("Set LOOOP_TEST_DATABASE_URL to run the PostgreSQL tests")
    release_engines()
    drop_database(parse_database_url(configured))
    yield configured
    release_engines()


def period(start: datetime, charge: float) -> dict:
    """Build one half-hour period for storage tests."""
    return {"from": start, "to": start + timedelta(minutes=30), "charge": charge}


def test_price_file_holds_only_from_to_and_charge(tmp_path: Path) -> None:
    """Keep the stored entries limited to the three fields consumers need."""
    fetched_at = datetime(2026, 9, 15, 16, 0, tzinfo=JST)
    periods = [period(datetime(2026, 9, 15, 0, 0, tzinfo=JST), 12.3)]

    result = store_prices(tmp_path, fetched_at, "03", "https://example.test", periods)

    document = json.loads(
        (tmp_path / "area-03/2026-09-15.json").read_text(encoding="utf-8")
    )
    assert result["status"] == "stored"
    assert document["prices"] == [
        {
            "from": "2026-09-15T00:00:00+09:00",
            "to": "2026-09-15T00:30:00+09:00",
            "charge": 12.3,
        }
    ]
    assert "raw" not in document
    assert (tmp_path / "area-03/README.md").exists()
    assert stored_prices(tmp_path, "03", 1)[0]["charge"] == 12.3


def test_price_file_is_rewritten_only_when_charges_change(tmp_path: Path) -> None:
    """Avoid pointless commits when the source repeats the same charges."""
    fetched_at = datetime(2026, 9, 15, 16, 0, tzinfo=JST)
    periods = [period(datetime(2026, 9, 15, 0, 0, tzinfo=JST), 12.3)]
    store_prices(tmp_path, fetched_at, "03", "https://example.test", periods)

    repeated = store_prices(
        tmp_path, fetched_at, "03", "https://example.test", periods
    )
    changed = store_prices(
        tmp_path,
        fetched_at,
        "03",
        "https://example.test",
        [period(datetime(2026, 9, 15, 0, 0, tzinfo=JST), 15.0)],
    )

    assert repeated["status"] == "unchanged"
    assert changed["status"] == "corrected"
    assert changed["corrections"][0]["differences"][0] == {
        "from": "2026-09-15T00:00:00+09:00",
        "existing_charge": 12.3,
        "incoming_charge": 15.0,
    }


def test_response_is_split_into_delivery_date_files(tmp_path: Path) -> None:
    """Store yesterday, today, and tomorrow in their own correctly named files."""
    fetched_at = datetime(2026, 9, 15, 16, 0, tzinfo=JST)
    periods = [
        period(datetime(2026, 9, 14, 23, 30, tzinfo=JST), 10.0),
        period(datetime(2026, 9, 15, 0, 0, tzinfo=JST), 20.0),
        period(datetime(2026, 9, 16, 0, 0, tzinfo=JST), 30.0),
    ]

    store_prices(tmp_path, fetched_at, "03", "https://example.test", periods)

    files = sorted(path.name for path in (tmp_path / "area-03").glob("*.json"))
    assert files == ["2026-09-14.json", "2026-09-15.json", "2026-09-16.json"]
    for file_name in files:
        document = json.loads(
            (tmp_path / "area-03" / file_name).read_text(encoding="utf-8")
        )
        assert len(document["prices"]) == 1
        assert document["prices"][0]["from"].startswith(file_name.removesuffix(".json"))


def test_raw_cache_keeps_only_the_newest_files(tmp_path: Path) -> None:
    """Hold a short rolling window instead of growing without limit."""
    for day in range(1, 14):
        fetched_at = datetime(2026, 9, day, 16, 0, tzinfo=JST)
        store_raw(
            tmp_path,
            fetched_at,
            "03",
            "https://example.test",
            f"digest-{day}",
            {"day": day},
            max_files=10,
        )

    names = [path.name for path in cached_paths(tmp_path, "03")]
    assert len(names) == 10
    assert names[0] == "2026-09-04.json"
    assert names[-1] == "2026-09-13.json"


def test_collect_writes_data_and_raw_cache(tmp_path: Path, monkeypatch) -> None:
    """Fan one fetched payload out to every enabled file destination."""
    fetched_at = datetime(2026, 9, 15, 16, 0, tzinfo=JST)
    payload = {"1": {"price_data": [12.3]}}
    monkeypatch.setattr(
        service,
        "fetch_prices",
        lambda *_: (fetched_at, '{"1":{"price_data":[12.3]}}', payload),
    )
    config = Config(
        area_codes=("03",),
        json_data_dir=tmp_path / "data",
        raw_cache_dir=tmp_path / "raw-cache",
    )

    result = service.collect(config)
    area = result["areas"]["03"]

    assert result["status"] == "stored"
    assert area["days"] == {"yesterday": 0, "today": 1, "tomorrow": 0}
    assert area["stores"]["data"]["periods"] == 1
    assert area["stores"]["raw_cache"]["retained"] == 1
    assert (tmp_path / "raw-cache/area-03/2026-09-15.json").exists()


def test_database_url_alone_creates_database_and_table(database_url: str) -> None:
    """Accept a plain URL and build everything the storage call needs."""
    fetched_at = datetime(2026, 9, 15, 16, 0, tzinfo=JST)

    result = store_in_database(
        database_url,
        fetched_at,
        "03",
        [period(datetime(2026, 9, 15, 0, 0, tzinfo=JST), 12.3)],
    )

    engine = create_engine(database_url)
    columns = {column["name"] for column in inspect(engine).get_columns("prices")}
    engine.dispose()
    assert result["inserted"] == 1
    assert columns.issuperset({"area_code", "valid_from", "charge", "observed_at"})
    assert stored_from_database(database_url, "03", 1)[0]["charge"] == 12.3


def test_database_updates_a_revised_charge(database_url: str, monkeypatch) -> None:
    """Record a corrected charge instead of silently keeping the old one."""
    fetched_at = datetime(2026, 9, 15, 16, 0, tzinfo=JST)
    config = Config(
        area_codes=("03",),
        json_storage_enabled=False,
        raw_cache_enabled=False,
        database_url=database_url,
    )
    for charge in (12.3, 15.0):
        monkeypatch.setattr(
            service,
            "fetch_prices",
            lambda *_, charge=charge: (
                fetched_at,
                "{}",
                {"1": {"price_data": [charge]}},
            ),
        )
        result = service.collect(config)

    assert result["areas"]["03"]["stores"]["database"]["updated"] == 1


def test_incompatible_existing_table_is_reported(database_url: str) -> None:
    """Refuse a database whose prices table lacks the columns we write."""
    db.create_database(parse_database_url(database_url))
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE prices (id integer PRIMARY KEY)"))
    engine.dispose()

    with pytest.raises(RuntimeError, match="area_code"):
        stored_from_database(database_url, "03", 1)


def test_collection_corrects_today_then_stores_tomorrow(
    tmp_path: Path, monkeypatch, caplog
) -> None:
    """Update a changed forecast without preventing the next day from storing."""
    previous_fetch = datetime(2026, 9, 15, 17, 0, tzinfo=JST)
    today_start = datetime(2026, 9, 16, 0, 0, tzinfo=JST)
    store_prices(
        tmp_path / "data",
        previous_fetch,
        "03",
        "https://example.test",
        [period(today_start, 27.5)],
    )
    monkeypatch.setattr(
        service,
        "fetch_prices",
        lambda *_: (
            datetime(2026, 9, 16, 17, 0, tzinfo=JST),
            "{}",
            {
                "1": {"price_data": [31.2]},
                "2": {"price_data": [22.4]},
            },
        ),
    )
    config = Config(
        area_codes=("03",),
        json_data_dir=tmp_path / "data",
        raw_cache_dir=tmp_path / "raw-cache",
    )

    with caplog.at_level("ERROR"):
        result = service.collect(config)

    data_store = result["areas"]["03"]["stores"]["data"]
    corrected = json.loads(
        (tmp_path / "data/area-03/2026-09-16.json").read_text()
    )
    tomorrow = json.loads(
        (tmp_path / "data/area-03/2026-09-17.json").read_text()
    )
    assert data_store["status"] == "corrected"
    assert result["status"] == "corrected"
    assert result["corrections"][0]["area"] == "03"
    assert result["corrections"][0]["date"] == "2026-09-16"
    assert corrected["prices"][0]["charge"] == 31.2
    assert tomorrow["prices"][0]["charge"] == 22.4
    assert "delivery date 2026-09-16 changed" in caplog.text
