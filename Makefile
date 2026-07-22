.PHONY: up down infra api bot worker lint format test migrate revision

COMPOSE := docker compose -f infra/docker-compose.yml

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
