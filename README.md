![Loop](https://raw.githubusercontent.com/aayusharyan/looop-price-warehouse/refs/heads/main/.github/looop_denki_logo.svg)
# Looop Price Warehouse

[![CI](https://img.shields.io/github/actions/workflow/status/aayusharyan/looop-price-warehouse/ci.yml?branch=main&label=CI)](https://github.com/aayusharyan/looop-price-warehouse/actions/workflows/ci.yml)
[![Daily collection](https://img.shields.io/github/actions/workflow/status/aayusharyan/looop-price-warehouse/collect-daily.yml?label=Daily%20Collection)](https://github.com/aayusharyan/looop-price-warehouse/actions/workflows/collect-daily.yml)
[![Warehouse Size](https://img.shields.io/badge/Warehouse%20Size-12%20days-informational)](https://github.com/aayusharyan/looop-price-warehouse/tree/main/data)
[![Please star this Repo](https://img.shields.io/badge/Please%20Star%20this%20repo%20%E2%AD%90%20-8A2BE2)](https://github.com/aayusharyan/looop-price-data)

This repository is a data warehouse: it fetches Looop Denki Smart Time ONE 30-minute prices and stores them as plain daily files. It is deliberately not an API, dashboard, alerting service, or integration platform. Other applications should read the stored files or connect independently to the configured database.

The collector requests all ten regions from Looop's undocumented JSON endpoint, using `https://looop-denki.com/api/prices?select_area=<code>`. The source may change without notice.

## Finding the prices

You do not need to run this project to use the warehouse. Open the [`data/`](data/) directory. That is the published archive: one folder per region, one file per day.

The [area table](data/README.md#area-table) in [`data/README.md`](data/README.md) maps each folder to a region and to the name Looop uses (Tokyo is `area-03`, 東京電力エリア). Pick your region, then open a `YYYY-MM-DD.json` file for the delivery day you care about. Each file is a list of 30-minute periods with a `charge` in yen per kWh. Times are Japan Standard Time.

GitHub shows those files in the browser. You can also download a single day, clone the repository, or browse older days in the commit history of `data/`. The [`raw-cache/`](raw-cache/) folder is not the public archive; it only keeps a short window of source responses for the collector.

## Quick start

File storage is enabled by default and needs no database:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD/data:/app/data" \
  -v "$PWD/raw-cache:/app/raw-cache" \
  ghcr.io/aayusharyan/looop-price-warehouse:latest
```

Or run from source:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
looop-price-collector collect
```

For a self-hosted warehouse that already includes PostgreSQL, use [`docker/docker-compose.example.yaml`](docker/docker-compose.example.yaml). Compose ignores that filename, so pass `-f` (or copy it to `docker-compose.yml`). From the repository root:

```bash
docker compose -f docker/docker-compose.example.yaml up -d
```

That starts the scheduled collector and a Postgres 16 server, writes daily files under `data/` and `raw-cache/`, and stores prices in the database as well. Set `POSTGRES_PASSWORD` before using it anywhere but a private machine. Remove the `postgres` service and its `depends_on` block when you already have a server, and point `DATABASE_URL` at it instead. Uncomment the published port if you need a client on the host to reach the bundled server.

## Running modes

The container has two modes, because a long-lived host and a CI runner need opposite behaviour.

`serve` is the default command. It stays running, collects once at startup, then repeats at each scheduled time, so `docker run` alone is enough to keep a warehouse current. The schedule is evaluated in Japan Standard Time regardless of the host clock. A failed collection is logged and the schedule continues, and `SIGTERM` stops the container immediately rather than after the current wait:

```bash
docker run -d --restart unless-stopped \
  --user "$(id -u):$(id -g)" \
  -v "$PWD/data:/app/data" \
  -v "$PWD/raw-cache:/app/raw-cache" \
  ghcr.io/aayusharyan/looop-price-warehouse:latest
```

`collect` runs a single collection and exits, which is what an external scheduler such as the GitHub Action uses:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD/data:/app/data" \
  -v "$PWD/raw-cache:/app/raw-cache" \
  ghcr.io/aayusharyan/looop-price-warehouse:latest collect
```

## What gets stored

The published archive is [`data/`](data/). The [area table](data/README.md#area-table) lists every region. Each area gets a directory holding its own README and one file per delivery day:

```
data/
  README.md
  area-01/
    README.md
    2026-09-15.json
  ...
```

A price file is a list of half-hour periods and nothing else:

```json
{
  "area": "03",
  "area_name": "東京電力エリア",
  "fetched_at": "2026-09-15T01:37:12+09:00",
  "source": "https://looop-denki.com/api/prices?select_area=03",
  "prices": [
    {
      "from": "2026-09-15T00:00:00+09:00",
      "to": "2026-09-15T00:30:00+09:00",
      "charge": 27.51
    }
  ]
}
```

`charge` is JPY per kWh. The file is rewritten only when a charge actually changes, so an unchanged day produces no commit.

The newest ten per area are cached in `raw-cache/`, which exists only to validate the collector and to preserve details the price files drop, such as the flags separating "tomorrow is not published yet" from "tomorrow failed to parse". Anything older is deleted automatically.

`display` prints stored periods. `--limit` counts half-hour periods back from the newest start time, so `48` is a day and `96` is two; it defaults to 48 periods of the first configured area. Once tomorrow's prices are published this shows tomorrow, not the past day:

```bash
looop-price-collector display
looop-price-collector display --area 03 --limit 96
```

## Published days and cross-validation

One response carries up to three delivery days: yesterday, today, and tomorrow. They are split into three independently named files. Tomorrow's prices appear around 16:00 JST, so a collection made before then creates or updates only yesterday and today. The `days` field in the result shows what arrived. Cross-validation happens during every collection. Before replacing an existing date, the collector compares every incoming charge with the file already on disk. If they differ, it logs an error identifying the area, date, and number of changed periods, then replaces the file because the latest response is the new truth. Processing continues, so tomorrow's newly published file is still stored. The machine-readable result includes the individual differences under `stores.data.corrections`.

## Storage configuration

Environment variables:

- `LOOOP_AREA_CODES` selects comma-separated area codes; default: all ten.
- `JSON_STORAGE_ENABLED` enables the daily price files; default: `true`.
- `JSON_DATA_DIR` selects their root folder; default: `./data`.
- `RAW_CACHE_ENABLED` enables the rolling raw cache; default: `true`.
- `RAW_CACHE_DIR` selects its root folder; default: `./raw-cache`.
- `RAW_CACHE_MAX_FILES` caps the cached responses per area; default: `10`.
- `COLLECT_SCHEDULE` sets the `serve` times in JST; default: `16:15,17:15`.
- `COLLECT_ON_START` collects once when `serve` starts; default: `true`.
- `DATABASE_URL` enables PostgreSQL storage when set; it has no default.
- `LOOOP_API_URL` overrides the upstream endpoint.
- `HTTP_TIMEOUT_SECONDS` controls the request timeout; default: `20`.

Collect only selected regions:

```bash
LOOOP_AREA_CODES=01,03 looop-price-collector collect
# Command-line selections override the environment for this invocation.
looop-price-collector collect --area 01 --area 03
```

Enable PostgreSQL while keeping JSON:

```bash
export DATABASE_URL='postgresql+psycopg://looop:password@localhost/looop'
looop-price-collector collect
```

Use PostgreSQL only:

```bash
export JSON_STORAGE_ENABLED=false
export DATABASE_URL='postgresql+psycopg://looop:password@localhost/looop'
looop-price-collector collect
looop-price-collector display --storage database
```

The database holds one row per area and period, with the charge updated in place when the source revises it. Its `valid_from`, `valid_to`, and `observed_at` columns are `timestamptz` and therefore hold UTC, so a period the JSON files show as `2026-09-15T00:00:00+09:00` appears as `2026-09-14 15:00:00+00` in a direct query; the collector's own reads convert it back to Japan Standard Time. Disabling the files without setting `DATABASE_URL` is rejected to prevent a successful-looking run that stores nothing; the raw cache alone does not count, since it is pruned.

PostgreSQL is the only supported SQL destination, and a URL for any other backend is rejected before the first fetch rather than halfway through storage. Nothing has to be prepared by hand: the first collection creates the database when the server does not have it yet, then creates the `prices` table. Creating the database needs a role with `CREATEDB`, and the URL's credentials must also reach the `postgres` maintenance database; when the database already exists neither is required. A `prices` table that exists without the columns the collector writes ends the run with an error instead of a partial write.

## Automated collection

The daily workflow pulls `ghcr.io/aayusharyan/looop-price-warehouse:latest`, the released image that a self-hosted collector runs too, so collection exercises the deployed artifact and a broken release shows up in this repository's own data first. Collection tracks published releases, not `main`, so a merge takes effect here only once a release is cut.

The workflow runs that container at 16:15 JST and again at 17:15 JST, because Looop publishes tomorrow's prices "around 16:00" without committing to an exact minute and GitHub may delay or skip a scheduled run. The second run costs nothing when the first succeeded, since an unchanged day is not rewritten. Each run mounts this repository's `data` and `raw-cache` directories, cross-validates while collecting, and commits only what changed. It can also be started manually. Repository Actions need `contents: write`; protected branches must permit the workflow's commit or use a dedicated data branch.

A correction fails the workflow run. When an incoming charge disagrees with a date already stored, the collector logs the details, writes the newer value, and exits with code `2` under `--fail-on-correction`. The run still commits the corrected files first and only then fails, so the disagreement is preserved in git rather than lost to a red build. Any other failure, such as an unreachable source, exits non-zero immediately and produces no commit. The workflow concurrency setting also prevents overlapping runs.

## Development

```bash
pip install -e '.[test,postgres]'
pytest
docker build -f docker/Dockerfile -t looop-price-warehouse .
```

The PostgreSQL tests need a server and are skipped without one. They drop and recreate the database named in the URL, so point them at a throwaway database:

```bash
docker run -d --rm --name looop-pg -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:16-alpine
LOOOP_TEST_DATABASE_URL='postgresql+psycopg://postgres:password@127.0.0.1:5432/looop_test' pytest
```

This warehouse preserves prices; consumers remain responsible for caching, access control, presentation, notifications, and business logic.

---
<sub>_Loop denki logo is a copyright of [Looopでんき](https://looop-denki.com)._</sub>