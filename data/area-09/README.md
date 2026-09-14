# 九州電力エリア

Area code: `09`

One file per delivery day, named by the Japan Standard Time date its prices apply to: `YYYY-MM-DD.json`.

Every entry in `prices` is one half-hour period:

- `from`: start of the period
- `to`: end of the period
- `charge`: price in JPY per kWh

Each file contains only that date's periods. A later collection checks its values against the existing file and replaces it if the source revised a charge.

The untouched source responses are not kept here. The most recent ones live in `raw-cache/area-09/`.

Source: `https://looop-denki.com/api/prices?select_area=09`
