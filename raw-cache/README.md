# Raw cache

A rolling window of the most recent untouched responses, kept per area in `area-<code>/YYYY-MM-DD.json`. Only the newest ten files per area are retained; older ones are deleted on the next collection.

These files exist to validate the collector: they allow a stored price to be traced back to the exact response it came from, and they record details the price files intentionally drop, such as the flags that distinguish "tomorrow is not published yet" from "tomorrow failed to parse".

This directory is a cache, not the warehouse. Prices live in `data/`, are kept forever, and are the only thing consumers should read.

Set `RAW_CACHE_ENABLED=false` to skip it, or `RAW_CACHE_MAX_FILES` to change the window size.
