FROM python:3.12-slim

# procps provides pgrep, used by the compose healthcheck (this image has no
# HTTP port to probe instead).
RUN apt-get update && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-base.txt ./requirements-base.txt
COPY worker/requirements.txt ./worker/requirements.txt
RUN pip install --no-cache-dir -r worker/requirements.txt

COPY shared ./shared
COPY worker ./worker
COPY alembic.ini ./alembic.ini

ENV PYTHONPATH=/app

CMD ["arq", "worker.worker.WorkerSettings"]
