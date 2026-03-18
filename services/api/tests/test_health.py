from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.shared.api.health import router


def test_healthz() -> None:
    """Smoke-test /healthz without booting the full app (no DB, no lifespan)."""
    test_app = FastAPI()
    test_app.include_router(router)

    with TestClient(test_app) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
