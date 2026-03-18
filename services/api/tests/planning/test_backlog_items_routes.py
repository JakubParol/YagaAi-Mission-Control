"""
Integration tests for backlog item management (unified work items in backlogs).

Coverage:
- POST /v1/planning/backlogs/{id}/items — add item (scope validation,
  global backlog rules, conflict on duplicate)
- DELETE /v1/planning/backlogs/{id}/items/{work_item_id} — remove item
- GET /v1/planning/backlogs/{id}/items — list items
- PATCH /v1/planning/backlogs/{id}/items/{work_item_id}/rank — update rank
- POST /v1/planning/backlogs/{id}/items/bulk — bulk add

Fixtures:
- client — FastAPI TestClient (from conftest)
- _setup_test_db — PostgreSQL with schema + seed data (from conftest)
"""

PREFIX = "/v1/planning/backlogs"


# ── Add item ─────────────────────────────────────────────────────────────


def test_add_item_to_backlog(client) -> None:
    resp = client.post(f"{PREFIX}/b1/items", json={"work_item_id": "s1"})
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["backlog_id"] == "b1"
    assert data["work_item_id"] == "s1"
    assert "rank" in data
    assert "added_at" in data


def test_add_item_with_explicit_rank(client) -> None:
    resp = client.post(f"{PREFIX}/b1/items", json={"work_item_id": "s1", "rank": "aaa"})
    assert resp.status_code == 201
    assert resp.json()["data"]["rank"] == "aaa"


def test_add_two_items_get_distinct_ranks(client) -> None:
    resp1 = client.post(f"{PREFIX}/b1/items", json={"work_item_id": "s1"})
    assert resp1.status_code == 201
    resp2 = client.post(f"{PREFIX}/b1/items", json={"work_item_id": "s2"})
    assert resp2.status_code == 201
    assert resp1.json()["data"]["rank"] != resp2.json()["data"]["rank"]


def test_add_item_nonexistent_backlog(client) -> None:
    resp = client.post(f"{PREFIX}/nope/items", json={"work_item_id": "s1"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_add_nonexistent_item(client) -> None:
    resp = client.post(f"{PREFIX}/b1/items", json={"work_item_id": "nope"})
    assert resp.status_code == 404


def test_add_item_conflict_already_in_backlog(client) -> None:
    client.post(f"{PREFIX}/b1/items", json={"work_item_id": "s1"})
    resp = client.post(f"{PREFIX}/b2/items", json={"work_item_id": "s1"})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CONFLICT"


def test_global_backlog_rejects_project_item(client) -> None:
    resp = client.post(f"{PREFIX}/bg/items", json={"work_item_id": "s1"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_global_backlog_accepts_global_item(client) -> None:
    resp = client.post(f"{PREFIX}/bg/items", json={"work_item_id": "sg"})
    assert resp.status_code == 201
    assert resp.json()["data"]["work_item_id"] == "sg"


def test_project_backlog_rejects_other_project_item(client) -> None:
    resp = client.post(f"{PREFIX}/b1/items", json={"work_item_id": "sp2"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_add_task_to_backlog(client) -> None:
    resp = client.post(f"{PREFIX}/b1/items", json={"work_item_id": "t1"})
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["work_item_id"] == "t1"


# ── Remove item ──────────────────────────────────────────────────────────


def test_remove_item_from_backlog(client) -> None:
    client.post(f"{PREFIX}/b1/items", json={"work_item_id": "s1"})
    resp = client.delete(f"{PREFIX}/b1/items/s1")
    assert resp.status_code == 204

    resp_again = client.delete(f"{PREFIX}/b1/items/s1")
    assert resp_again.status_code == 404


# ── List items ───────────────────────────────────────────────────────────


def test_list_backlog_items(client) -> None:
    client.post(f"{PREFIX}/b1/items", json={"work_item_id": "s1"})
    client.post(f"{PREFIX}/b1/items", json={"work_item_id": "s2"})

    resp = client.get(f"{PREFIX}/b1/items")
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert len(items) == 2
    ids = [i["id"] for i in items]
    assert "s1" in ids
    assert "s2" in ids


def test_list_backlog_items_empty(client) -> None:
    resp = client.get(f"{PREFIX}/b1/items")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


# ── Update rank ──────────────────────────────────────────────────────────


def test_update_item_rank(client) -> None:
    client.post(f"{PREFIX}/b1/items", json={"work_item_id": "s1"})
    resp = client.patch(f"{PREFIX}/b1/items/s1/rank", json={"rank": "zzz"})
    assert resp.status_code == 200

    # Verify the rank persisted
    items_resp = client.get(f"{PREFIX}/b1/items")
    assert items_resp.status_code == 200
    item = next(i for i in items_resp.json()["data"] if i["id"] == "s1")
    assert item["rank"] == "zzz"


# ── Bulk add ─────────────────────────────────────────────────────────────


def test_bulk_add_items(client) -> None:
    resp = client.post(
        f"{PREFIX}/b1/items/bulk",
        json={"work_item_ids": ["s1", "s2"]},
    )
    assert resp.status_code == 201

    list_resp = client.get(f"{PREFIX}/b1/items")
    items = list_resp.json()["data"]
    ids = [i["id"] for i in items]
    assert "s1" in ids
    assert "s2" in ids
