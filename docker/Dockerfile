# Build a small, non-root image that collects on a schedule by default and can
# also run a single collection for external schedulers such as CI.
# Invoke from the repository root so COPY can see pyproject.toml and src/.
FROM python:3.12-slim AS builder

WORKDIR /build
COPY pyproject.toml README.md ./
COPY src/looop_price_collector ./src/looop_price_collector

# Install into a venv rather than the system Python so the final stage can pick up
# the package and its dependencies by copying one directory. The postgres extra is
# always included so an image can write to a database without being rebuilt.
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir ".[postgres]"

FROM python:3.12-slim

# The release workflow rewrites both version labels in place and commits them with
# the bumped __version__, so every build of a given commit is labelled the same way
# with no build arguments. Keep each literal on its own line: the workflow verifies
# the rewrite by counting matching lines.
LABEL org.opencontainers.image.title="Looop Price Warehouse" \
      org.opencontainers.image.description="Warehouse collector for Looop Denki electricity price data" \
      org.opencontainers.image.source="https://github.com/aayusharyan/looop-price-warehouse" \
      org.opencontainers.image.version="0.1.0" \
      version="0.1.0"

RUN groupadd --system --gid 10001 collector \
    && useradd --system --uid 10001 --gid collector --home-dir /app collector
COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
RUN mkdir -p /app/data /app/raw-cache \
    && chown collector:collector /app/data /app/raw-cache
USER collector

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LOOOP_AREA_CODES=01,02,03,04,05,06,07,08,09,10 \
    JSON_STORAGE_ENABLED=true \
    JSON_DATA_DIR=/app/data \
    RAW_CACHE_ENABLED=true \
    RAW_CACHE_DIR=/app/raw-cache \
    RAW_CACHE_MAX_FILES=10 \
    COLLECT_SCHEDULE=16:15,17:15 \
    COLLECT_ON_START=true

VOLUME ["/app/data", "/app/raw-cache"]
ENTRYPOINT ["looop-price-collector"]
CMD ["serve"]
