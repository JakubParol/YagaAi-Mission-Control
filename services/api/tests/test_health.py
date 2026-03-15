from fastapi.testclient import TestClient


def test_healthz(monkeypatch) -> None:
    from app.main import app
    from tests.support.runtime import disable_runtime_postgres

    disable_runtime_postgres(monkeypatch)
    with TestClient(app) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
