# Looop Price Warehouse

This repository is a data warehouse: it fetches Looop Denki Smart Time ONE 30-minute prices and stores them as plain daily files. It is deliberately not an API, dashboard, alerting service, or integration platform. Other applications should read the stored files or connect independently to the configured database.

The collector requests all ten regions from Looop's undocumented JSON endpoint, using `https://looop-denki.com/api/prices?select_area=<code>`. The source may change without notice.


## Quick start

File storage is enabled by default and needs no database:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD/data:/app/data" \
  -v "$PWD/raw-cache:/app/raw-cache" \
  ghcr.io/aayusharyan/looop-price-data:latest
```

Or run from source:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
looop-collector collect
```


## What gets stored

Each area gets a directory holding its own README and one file per delivery day:

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
    { "from": "2026-09-15T00:00:00+09:00", "to": "2026-09-15T00:30:00+09:00", "charge": 27.51 }
  ]
}
```

`charge` is JPY per kWh. The file is rewritten only when a charge actually changes, so an unchanged day produces no commit.

The newest ten per area are cached in `raw-cache/`, which exists only to validate the collector and to preserve details the price files drop, such as the flags separating "tomorrow is not published yet" from "tomorrow failed to parse". Anything older is deleted automatically.

Inspect the newest stored periods:

```bash
looop-collector latest --limit 48
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
- `DATABASE_URL` enables SQL storage when set; it has no default.
- `LOOOP_API_URL` overrides the upstream endpoint.
- `HTTP_TIMEOUT_SECONDS` controls the request timeout; default: `20`.

Collect only selected regions:

```bash
LOOOP_AREA_CODES=01,03 looop-collector collect
# Command-line selections override the environment for this invocation.
looop-collector collect --area 01 --area 03
```

Enable PostgreSQL while keeping JSON:

```bash
export DATABASE_URL='postgresql+psycopg://looop:password@localhost/looop'
looop-collector collect
```

Use PostgreSQL only:

```bash
export JSON_STORAGE_ENABLED=false
export DATABASE_URL='postgresql+psycopg://looop:password@localhost/looop'
looop-collector collect
looop-collector latest --storage database
```

The database holds one row per area and period, with the charge updated in place when the source revises it. Disabling the files without setting `DATABASE_URL` is rejected to prevent a successful-looking run that stores nothing; the raw cache alone does not count, since it is pruned. SQLite URLs remain supported for small local experiments.


## Automated collection

The daily workflow runs the published container at 16:15 JST and again at 17:15 JST, because Looop publishes tomorrow's prices "around 16:00" without committing to an exact minute and GitHub may delay or skip a scheduled run. The second run costs nothing when the first succeeded, since an unchanged day is not rewritten. Each run mounts this repository's `data` and `raw-cache` directories, cross-validates while collecting, and commits only what changed. It can also be started manually. Repository Actions need `contents: write`; protected branches must permit the workflow's commit or use a dedicated data branch.

A correction fails the workflow run. When an incoming charge disagrees with a date already stored, the collector logs the details, writes the newer value, and exits with code `2` under `--fail-on-correction`. The run still commits the corrected files first and only then fails, so the disagreement is preserved in git rather than lost to a red build. Any other failure, such as an unreachable source, exits non-zero immediately and produces no commit. The workflow concurrency setting also prevents overlapping runs.


## Development

```bash
pip install -e '.[test,postgres]'
pytest
docker build -t looop-price-data .
```

This warehouse preserves prices; consumers remain responsible for caching, access control, presentation, notifications, and business logic.