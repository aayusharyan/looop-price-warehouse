# Build a small, non-root image that collects on a schedule by default and can
# also run a single collection for external schedulers such as CI.
# Invoke from the repository root so COPY can see pyproject.toml and src/.
FROM python:3.12-slim AS builder

ARG VERSION=0.0.0

WORKDIR /build
COPY pyproject.toml README.md ./
COPY src/looop_price_collector ./src/looop_price_collector

# Rewrite __version__ to the version being built. pyproject reads the package
# version from that attribute, so this is what makes the installed package agree
# with the image label. sed exits 0 even when its pattern matched nothing, so grep
# re-reads the file afterwards and fails the build instead of quietly installing
# whatever version the source happened to carry.
RUN sed -i "s/^__version__ = .*/__version__ = \"${VERSION}\"/" \
        src/looop_price_collector/__init__.py \
    && grep --quiet --line-regexp "__version__ = \"${VERSION}\"" \
        src/looop_price_collector/__init__.py

# Install into a venv rather than the system Python so the final stage can pick up
# the package and its dependencies by copying one directory. The postgres extra is
# always included so an image can write to a database without being rebuilt.
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir ".[postgres]"

FROM python:3.12-slim

# Repeated because an ARG only applies to the stage that declares it. Local builds
# fall back to 0.0.0, marking the image as something other than a real release.
ARG VERSION=0.0.0
LABEL org.opencontainers.image.title="Looop Price Warehouse" \
      org.opencontainers.image.description="Warehouse collector for Looop Denki electricity price data" \
      org.opencontainers.image.source="https://github.com/aayusharyan/looop-price-warehouse" \
      org.opencontainers.image.version="${VERSION}"

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
