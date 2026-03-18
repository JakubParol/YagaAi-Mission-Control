from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session", autouse=True)
def _configure_database() -> Iterator[None]:  # type: ignore[override]
    yield


@pytest.fixture(autouse=True)
def _reset_database() -> Iterator[None]:  # type: ignore[override]
    yield


def test_healthz() -> None:
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
