.PHONY: up down infra api bot worker lint format test migrate revision

# --env-file is explicit (not left to Compose's own auto-detection) because
# Compose looks for .env next to the compose file (infra/) by default, not
# in the repo root where it actually lives — without this, ${VAR:-default}
# substitutions in docker-compose.yml silently fall back to their defaults.
COMPOSE := docker compose -f infra/docker-compose.yml --env-file .env

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

infra:
	$(COMPOSE) up -d postgres redis

api:
	PYTHONPATH=. uvicorn api.app.main:app --reload --host 0.0.0.0 --port 8000

bot:
	PYTHONPATH=. python -m bot.bot

worker:
	PYTHONPATH=. arq worker.worker.WorkerSettings --watch worker

lint:
	ruff check .

format:
	ruff format .
	ruff check . --fix

test:
	PYTHONPATH=. pytest -q

migrate:
	PYTHONPATH=. alembic upgrade head

revision:
	PYTHONPATH=. alembic revision -m "$(m)"
