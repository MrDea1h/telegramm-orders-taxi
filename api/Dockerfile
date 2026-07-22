FROM python:3.12-slim

WORKDIR /app

COPY requirements-base.txt ./requirements-base.txt
COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

COPY shared ./shared
COPY api ./api
COPY alembic.ini ./alembic.ini

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["uvicorn", "api.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
