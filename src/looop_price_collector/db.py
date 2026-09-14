"""Prepare the PostgreSQL destination from a URL and keep its table current."""

from datetime import datetime, timezone
import threading
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Engine, create_engine, inspect, select, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError, OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from .models import Base, Price

JST = ZoneInfo("Asia/Tokyo")

# PostgreSQL is the only supported SQL destination; other backends are rejected
# before a collection starts rather than failing halfway through storage.
SUPPORTED_BACKEND = "postgresql"

# Every PostgreSQL installation ships this database, so it is where a login
# lands when the configured database does not exist yet.
MAINTENANCE_DATABASE = "postgres"

# An engine owns a connection pool, so one is kept per URL and the database is
# prepared once instead of on every collection.
ENGINES: dict[str, Engine] = {}
ENGINE_LOCK = threading.Lock()

EXAMPLE_URL = "postgresql+psycopg://user:password@host:5432/looop"


def as_utc(value: datetime) -> datetime:
    """Normalize to UTC so stored and incoming periods compare on equal terms."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_database_url(database_url: str) -> URL:
    """Turn the configured string into a URL that names a PostgreSQL database."""
    try:
        url = make_url(database_url)
    except ArgumentError as error:
        raise ValueError(f"DATABASE_URL is not a connection URL: {error}") from None
    if url.get_backend_name() != SUPPORTED_BACKEND:
        raise ValueError(
            f"DATABASE_URL must be a PostgreSQL URL such as {EXAMPLE_URL}, "
            f"got the {url.get_backend_name()} backend"
        )
    if not url.database:
        raise ValueError(
            f"DATABASE_URL must name a database, as in {EXAMPLE_URL}"
        )
    return url


def create_database(url: URL) -> None:
    """Create the configured database through a login to the server itself."""
    # CREATE DATABASE cannot run inside a transaction, so the connection commits
    # every statement on its own.
    engine = create_engine(
        url.set(database=MAINTENANCE_DATABASE), isolation_level="AUTOCOMMIT"
    )
    try:
        with engine.connect() as connection:
            # A database name cannot travel as a bound parameter, so the dialect
            # quotes it before it becomes part of the statement.
            name = engine.dialect.identifier_preparer.quote(url.database)
            connection.execute(text(f"CREATE DATABASE {name}"))
    finally:
        engine.dispose()


def ensure_database(url: URL) -> None:
    """Make the database reachable, creating it when the server does not have it."""
    engine = create_engine(url)
    try:
        with engine.connect():
            return
    except OperationalError as error:
        # The server refuses a connection for a missing database, but also for
        # bad credentials or an unreachable host, so the original failure is
        # reported whenever creating the database does not resolve it.
        try:
            create_database(url)
        except SQLAlchemyError:
            raise error from None
    finally:
        engine.dispose()


def init_db(engine: Engine) -> None:
    """Create the price table when missing and reject an incompatible one."""
    Base.metadata.create_all(engine)
    present = {
        column["name"]
        for column in inspect(engine).get_columns(Price.__tablename__)
    }
    missing = sorted(set(Price.__table__.columns.keys()) - present)
    if missing:
        raise RuntimeError(
            f"Table {Price.__tablename__!r} already exists in the configured "
            f"database without the columns {', '.join(missing)}; "
            "point DATABASE_URL at another database or add the missing columns"
        )


def make_engine(database_url: str) -> Engine:
    """Return a prepared engine, reusing the pool built for the same URL."""
    with ENGINE_LOCK:
        engine = ENGINES.get(database_url)
        if engine is None:
            url = parse_database_url(database_url)
            ensure_database(url)
            # Pooled connections can be dropped by the server between the daily
            # collections, so each one is checked out only after a ping.
            engine = create_engine(url, pool_pre_ping=True)
            init_db(engine)
            ENGINES[database_url] = engine
        return engine


def store_in_database(
    database_url: str,
    fetched_at: datetime,
    area_code: str,
    periods: list[dict[str, Any]],
) -> dict[str, Any]:
    """Insert new periods and update any whose charge the source revised."""
    engine = make_engine(database_url)
    inserted = 0
    updated = 0

    with Session(engine) as session:
        existing = {
            as_utc(row.valid_from): row
            for row in session.scalars(
                select(Price).where(Price.area_code == area_code)
            )
        }
        for period in periods:
            row = existing.get(as_utc(period["from"]))
            if row is None:
                session.add(
                    Price(
                        area_code=area_code,
                        valid_from=as_utc(period["from"]),
                        valid_to=as_utc(period["to"]),
                        charge=period["charge"],
                        observed_at=as_utc(fetched_at),
                    )
                )
                inserted += 1
            elif row.charge != period["charge"]:
                row.charge = period["charge"]
                row.observed_at = as_utc(fetched_at)
                updated += 1
        session.commit()

    return {
        "status": "stored" if inserted or updated else "unchanged",
        "inserted": inserted,
        "updated": updated,
    }


def latest_from_database(
    database_url: str, area_code: str, limit: int
) -> list[dict[str, Any]]:
    """Return the newest stored periods in chronological order."""
    engine = make_engine(database_url)
    with Session(engine) as session:
        rows = session.scalars(
            select(Price)
            .where(Price.area_code == area_code)
            .order_by(Price.valid_from.desc())
            .limit(limit)
        ).all()
        # Reported in Japan Standard Time so SQL output matches the files.
        return [
            {
                "from": as_utc(row.valid_from).astimezone(JST).isoformat(),
                "to": as_utc(row.valid_to).astimezone(JST).isoformat(),
                "charge": row.charge,
            }
            for row in reversed(rows)
        ]
