import pytest


@pytest.fixture()
def db_path(database_url: str) -> str:
    return database_url


@pytest.fixture()
def client(request):
    _ = request.getfixturevalue("db_path")
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)
