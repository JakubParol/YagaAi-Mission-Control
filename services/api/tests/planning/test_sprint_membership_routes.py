"""Integration tests for sprint membership management endpoints."""

PREFIX = "/v1/planning/backlogs"
MOVE_IN_URL = f"{PREFIX}/active-sprint/items"


def _add_item_to_backlog(client, backlog_id: str, work_item_id: str) -> None:
    resp = client.post(
        f"{PREFIX}/{backlog_id}/items",
        json={"work_item_id": work_item_id},
    )
    assert resp.status_code == 201


def _list_item_ids(client, backlog_id: str) -> list[str]:
    resp = client.get(f"{PREFIX}/{backlog_id}/items")
    assert resp.status_code == 200
    return [item["id"] for item in resp.json()["data"]]


def test_add_item_to_active_sprint_from_product_backlog(client) -> None:
    _add_item_to_backlog(client, "b1", "s1")

    resp = client.post(f"{MOVE_IN_URL}?project_id=p1", json={"work_item_id": "s1"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["work_item_id"] == "s1"
    assert data["source_backlog_id"] == "b1"
    assert data["target_backlog_id"] == "b2"
    assert data["moved"] is True
    assert _list_item_ids(client, "b1") == []
    assert _list_item_ids(client, "b2") == ["s1"]


def test_add_item_to_active_sprint_idempotent_when_already_present(client) -> None:
    _add_item_to_backlog(client, "b2", "s1")

    resp = client.post(f"{MOVE_IN_URL}?project_id=p1", json={"work_item_id": "s1"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["moved"] is False
    assert data["source_backlog_id"] == "b2"
    assert data["target_backlog_id"] == "b2"
    assert _list_item_ids(client, "b2") == ["s1"]


def test_add_item_to_active_sprint_requires_product_backlog_membership(client) -> None:
    resp = client.post(f"{MOVE_IN_URL}?project_id=p1", json={"work_item_id": "s1"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_add_item_to_active_sprint_missing_project_selector(client) -> None:
    _add_item_to_backlog(client, "b1", "s1")

    resp = client.post(MOVE_IN_URL, json={"work_item_id": "s1"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_add_item_to_active_sprint_no_active_sprint(client) -> None:
    resp = client.post(f"{MOVE_IN_URL}?project_id=p2", json={"work_item_id": "sp2"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_remove_item_from_active_sprint_to_product_backlog(client) -> None:
    _add_item_to_backlog(client, "b2", "s1")
    _add_item_to_backlog(client, "b1", "s2")

    resp = client.delete(f"{MOVE_IN_URL}/s1?project_id=p1")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["work_item_id"] == "s1"
    assert data["source_backlog_id"] == "b2"
    assert data["target_backlog_id"] == "b1"
    assert data["moved"] is True
    assert _list_item_ids(client, "b2") == []
    assert "s1" in _list_item_ids(client, "b1")


def test_remove_item_from_active_sprint_idempotent_when_already_in_product_backlog(client) -> None:
    _add_item_to_backlog(client, "b1", "s1")

    resp = client.delete(f"{MOVE_IN_URL}/s1?project_id=p1")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["moved"] is False
    assert data["source_backlog_id"] == "b1"
    assert data["target_backlog_id"] == "b1"


def test_remove_item_from_active_sprint_requires_membership(client) -> None:
    resp = client.delete(f"{MOVE_IN_URL}/s1?project_id=p1")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_remove_item_from_active_sprint_missing_project_selector(client) -> None:
    _add_item_to_backlog(client, "b2", "s1")

    resp = client.delete(f"{MOVE_IN_URL}/s1")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
