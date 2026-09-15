# Prices

You only need this folder to use the warehouse. Every area has its own directory named `area-<code>`, containing a README for that area and one file per delivery day. The filename is the Japan Standard Time date the prices apply to, not the date they were collected.

GitHub can show a file in the browser. Open your region from the table below, then the `YYYY-MM-DD.json` file for the day you care about.

Each file holds a list of half-hour periods with three fields:

```json
{
  "from": "2026-09-15T00:00:00+09:00",
  "to": "2026-09-15T00:30:00+09:00",
  "charge": 27.51
}
```

`charge` is the price in JPY per kWh for that period. Times use Japan Standard Time (`+09:00`). The file also records the area code, the name Looop uses, when it was last fetched, and the source URL.

## Area table

| Folder                 | Area code | Region   | Looop name       |
| ---------------------- | --------- | -------- | ---------------- |
| [`area-01/`](area-01/) | `01`      | Hokkaido | 北海道電力エリア |
| [`area-02/`](area-02/) | `02`      | Tohoku   | 東北電力エリア   |
| [`area-03/`](area-03/) | `03`      | Tokyo    | 東京電力エリア   |
| [`area-04/`](area-04/) | `04`      | Chubu    | 中部電力エリア   |
| [`area-05/`](area-05/) | `05`      | Hokuriku | 北陸電力エリア   |
| [`area-06/`](area-06/) | `06`      | Kansai   | 関西電力エリア   |
| [`area-07/`](area-07/) | `07`      | Chugoku  | 中国電力エリア   |
| [`area-08/`](area-08/) | `08`      | Shikoku  | 四国電力エリア   |
| [`area-09/`](area-09/) | `09`      | Kyushu   | 九州電力エリア   |
| [`area-10/`](area-10/) | `10`      | Okinawa  | 沖縄電力エリア   |

These files are committed by the daily collection, so the history of this directory is the history of published prices. The untouched source responses are not stored here; a short rolling window of them lives in `raw-cache/`.
