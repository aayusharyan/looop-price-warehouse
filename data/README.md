# Prices

Every area has its own directory named `area-<code>`, containing a README for that area and one file per delivery day, named by the Japan Standard Time date its prices apply to.

Each file holds a list of half-hour periods with three fields:

```json
{ "from": "2026-09-15T00:00:00+09:00", "to": "2026-09-15T00:30:00+09:00", "charge": 27.51 }
```

`charge` is the price in JPY per kWh for that period.

Areas are `01` Hokkaido, `02` Tohoku, `03` Tokyo, `04` Chubu, `05` Hokuriku, `06` Kansai, `07` Chugoku, `08` Shikoku, `09` Kyushu, and `10` Okinawa.

These files are committed by the daily collection, so the history of this directory is the history of published prices. The untouched source responses are not stored here; a short rolling window of them lives in `raw-cache/`.
