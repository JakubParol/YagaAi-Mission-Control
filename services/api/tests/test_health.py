"""
Health endpoint smoke test.

Coverage:
- GET /healthz — verifies 200 response with {"status": "ok"}

Fixtures:
- None (creates its own TestClient)
"""

from fastapi.testclient import TestClient

from app.main import app


def test_healthz() -> None:
    client = TestClient(app)
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
