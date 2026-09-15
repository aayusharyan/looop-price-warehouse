# Prices

Every area has its own directory named `area-<code>`, containing a README for that area and one file per delivery day, named by the Japan Standard Time date its prices apply to.

Each file holds a list of half-hour periods with three fields:

```json
{
  "from": "2026-09-15T00:00:00+09:00",
  "to": "2026-09-15T00:30:00+09:00",
  "charge": 27.51
}
```

`charge` is the price in JPY per kWh for that period.

| Folder                 | Area code | Region   |
| ---------------------- | --------- | -------- |
| [`area-01/`](area-01/) | `01`      | Hokkaido |
| [`area-02/`](area-02/) | `02`      | Tohoku   |
| [`area-03/`](area-03/) | `03`      | Tokyo    |
| [`area-04/`](area-04/) | `04`      | Chubu    |
| [`area-05/`](area-05/) | `05`      | Hokuriku |
| [`area-06/`](area-06/) | `06`      | Kansai   |
| [`area-07/`](area-07/) | `07`      | Chugoku  |
| [`area-08/`](area-08/) | `08`      | Shikoku  |
| [`area-09/`](area-09/) | `09`      | Kyushu   |
| [`area-10/`](area-10/) | `10`      | Okinawa  |

These files are committed by the daily collection, so the history of this directory is the history of published prices. The untouched source responses are not stored here; a short rolling window of them lives in `raw-cache/`.
