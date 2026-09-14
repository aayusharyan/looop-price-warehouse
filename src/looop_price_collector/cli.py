"""Expose collection and warehouse inspection as shell-friendly commands."""

import argparse
from dataclasses import replace
import json
import logging
import signal
import threading
from typing import Any

from .areas import ALL_AREA_CODES
from .config import Config
from .db import latest_from_database
from .json_store import latest_prices
from .scheduler import serve
from .service import collect

LOGGER = logging.getLogger(__name__)

# Distinct from 1 so a caller can tell corrected prices, which are stored
# successfully, apart from a collection that failed outright.
EXIT_CORRECTION = 2


def command_collect(args: argparse.Namespace) -> None:
    """Collect all configured areas, or only areas selected on the command line."""
    config = Config()
    if args.area:
        config = replace(config, area_codes=tuple(args.area))
    result = collect(config)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.fail_on_correction and result["corrections"]:
        raise SystemExit(EXIT_CORRECTION)


def command_serve(_: argparse.Namespace) -> None:
    """Keep collecting on the configured schedule until the container stops."""
    config = Config()
    config.validate()
    logging.getLogger("looop_price_collector").setLevel(logging.INFO)
    stop_event = threading.Event()

    # Container runtimes stop a process with SIGTERM, so both signals end the
    # wait cleanly rather than leaving a partial collection behind.
    for stop_signal in (signal.SIGINT, signal.SIGTERM):
        signal.signal(stop_signal, lambda *_: stop_event.set())

    def run_once() -> None:
        result = collect(config)
        print(json.dumps(result, ensure_ascii=False))

    LOGGER.info(
        "Collecting daily at %s Japan Standard Time",
        ", ".join(scheduled.strftime("%H:%M") for scheduled in config.schedule),
    )
    serve(config.schedule, run_once, config.collect_on_start, stop_event)


def command_latest(args: argparse.Namespace) -> None:
    """Print the newest stored periods from the selected destination."""
    config = Config()
    config.validate()
    area_code = args.area or config.area_codes[0]
    rows: list[dict[str, Any]]
    if args.storage == "database":
        if not config.database_url:
            raise SystemExit("DATABASE_URL is required for --storage database")
        rows = latest_from_database(config.database_url, area_code, args.limit)
    else:
        if not config.json_storage_enabled:
            raise SystemExit("JSON storage is disabled")
        rows = latest_prices(config.json_data_dir, area_code, args.limit)
    print(json.dumps(rows, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    """Build the command tree and connect commands to their handlers."""
    parser = argparse.ArgumentParser(
        description="Collect Looop Denki prices into a data warehouse"
    )
    subparsers = parser.add_subparsers(required=True)

    collect_parser = subparsers.add_parser("collect", help="fetch and store prices")
    collect_parser.add_argument(
        "--area", action="append", choices=ALL_AREA_CODES, help="collect only this area"
    )
    collect_parser.add_argument(
        "--fail-on-correction",
        action="store_true",
        help="exit with code 2 when already published prices had to be corrected",
    )
    collect_parser.set_defaults(func=command_collect)

    serve_parser = subparsers.add_parser(
        "serve", help="collect repeatedly on a daily schedule"
    )
    serve_parser.set_defaults(func=command_serve)

    latest_parser = subparsers.add_parser("latest", help="inspect recent prices")
    latest_parser.add_argument("--area", choices=ALL_AREA_CODES)
    latest_parser.add_argument("--limit", type=int, default=48)
    latest_parser.add_argument(
        "--storage", choices=("json", "database"), default="json"
    )
    latest_parser.set_defaults(func=command_latest)

    return parser


def main() -> None:
    """Parse command-line arguments and invoke the selected command."""
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s: %(message)s")
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
