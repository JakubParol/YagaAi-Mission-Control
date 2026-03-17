from fastapi.testclient import TestClient

from app.main import app


def test_healthz() -> None:
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
