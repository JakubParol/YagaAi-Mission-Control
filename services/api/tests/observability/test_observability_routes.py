def test_healthz(client) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200


def test_get_costs_empty_db(client) -> None:
    response = client.get("/v1/observability/costs?days=7")
    assert response.status_code == 200
    data = response.json()
    assert "daily" in data
    assert isinstance(data["daily"], list)


def test_get_requests_empty_db(client) -> None:
    response = client.get("/v1/observability/requests")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "meta" in data
    assert data["meta"]["page"] == 1


def test_get_request_models_empty_db(client) -> None:
    response = client.get("/v1/observability/requests/models")
    assert response.status_code == 200
    data = response.json()
    assert "models" in data
    assert isinstance(data["models"], list)


def test_get_import_status_empty_db(client) -> None:
    response = client.get("/v1/observability/imports/status")
    assert response.status_code == 200
    data = response.json()
    assert "lastImport" in data
    assert "counts" in data
