from fastapi.testclient import TestClient


def test_healthz_after_boot_migrations():
    # Lazy import: must happen after the autouse _patch_database_url fixture
    # has pointed DATABASE_URL at the testcontainers Postgres and cleared
    # get_settings' cache, so the lifespan's upgrade_to_head() targets the
    # throwaway test DB, not a dev Postgres.
    from api.app.main import app

    with TestClient(app) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
