FROM ghcr.io/astral-sh/uv:0.10.12 AS uv
FROM python:3.12-slim-bookworm
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    SHADY_DATA_DIR=/app/data/processed SHADY_LOG_FILE="" \
    PATH="/app/backend/.venv/bin:$PATH"
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project && uv cache clean
COPY backend/src ./src
RUN uv sync --frozen --no-dev --no-editable \
    && uv cache clean \
    && groupadd --gid 10001 shady \
    && useradd --uid 10001 --gid shady --no-create-home shady
COPY --chown=shady:shady data/processed/boundary.json \
    data/processed/buildings.parquet data/processed/manifest.json \
    data/processed/walk.graphml data/processed/woodland.parquet /app/data/processed/
USER shady
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn shady.api:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --no-access-log"]
