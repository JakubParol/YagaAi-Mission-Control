"""
Integration tests for the epics CRUD API.

Coverage:
- POST /v1/planning/epics — create with key generation, validation, cross-project
- GET /v1/planning/epics — list with project/status filters, pagination, sorting
- GET /v1/planning/epics/{id} — single epic with story_count aggregation
- PATCH /v1/planning/epics/{id} — update title, description, status (override logic)
- DELETE /v1/planning/epics/{id} — hard delete, ON DELETE SET NULL on stories

Fixtures:
- client — FastAPI TestClient (from conftest)
- _setup_test_db — in-memory SQLite with schema + seed data (from conftest)
"""

import sqlite3

TS = "2026-01-01T00:00:00Z"


# ── Create ────────────────────────────────────────────────────────────────


def test_create_epic(client) -> None:
    resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Authentication Epic"},
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["project_id"] == "p1"
    assert data["key"] == "P1-1"
    assert data["title"] == "Authentication Epic"
    assert data["status"] == "TODO"
    assert data["status_mode"] == "MANUAL"
    assert data["is_blocked"] is False
    assert "id" in data
    assert "created_at" in data


def test_create_epic_with_description_and_priority(client) -> None:
    resp = client.post(
        "/v1/planning/epics",
        json={
            "project_id": "p1",
            "title": "Infra Epic",
            "description": "Infrastructure work",
            "priority": 5,
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["description"] == "Infrastructure work"
    assert data["priority"] == 5


def test_create_epic_increments_counter(client) -> None:
    resp1 = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Epic 1"},
    )
    resp2 = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Epic 2"},
    )
    assert resp1.json()["data"]["key"] == "P1-1"
    assert resp2.json()["data"]["key"] == "P1-2"


def test_create_epic_different_project(client) -> None:
    resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p2", "title": "P2 Epic"},
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["key"] == "P2-1"


def test_create_epic_nonexistent_project(client) -> None:
    resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "nope", "title": "Bad Epic"},
    )
    assert resp.status_code == 400


def test_create_epic_empty_title(client) -> None:
    resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": ""},
    )
    assert resp.status_code == 422


# ── List ──────────────────────────────────────────────────────────────────


def test_list_epics_empty(client) -> None:
    resp = client.get("/v1/planning/epics")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["meta"]["total"] == 0


def test_list_epics_with_data(client) -> None:
    client.post("/v1/planning/epics", json={"project_id": "p1", "title": "E1"})
    client.post("/v1/planning/epics", json={"project_id": "p1", "title": "E2"})
    client.post("/v1/planning/epics", json={"project_id": "p2", "title": "E3"})

    resp = client.get("/v1/planning/epics")
    assert resp.status_code == 200
    assert resp.json()["meta"]["total"] == 3


def test_list_epics_filter_by_project(client) -> None:
    client.post("/v1/planning/epics", json={"project_id": "p1", "title": "E1"})
    client.post("/v1/planning/epics", json={"project_id": "p2", "title": "E2"})

    resp = client.get("/v1/planning/epics", params={"project_id": "p1"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 1
    assert body["data"][0]["project_id"] == "p1"


def test_list_epics_filter_by_status(client) -> None:
    client.post("/v1/planning/epics", json={"project_id": "p1", "title": "E1"})
    epic_id = client.post("/v1/planning/epics", json={"project_id": "p1", "title": "E2"}).json()[
        "data"
    ]["id"]
    client.patch(f"/v1/planning/epics/{epic_id}", json={"status": "IN_PROGRESS"})

    resp = client.get("/v1/planning/epics", params={"status": "TODO"})
    assert resp.json()["meta"]["total"] == 1


def test_list_epics_pagination(client) -> None:
    for i in range(5):
        client.post("/v1/planning/epics", json={"project_id": "p1", "title": f"E{i}"})

    resp = client.get("/v1/planning/epics", params={"limit": 2, "offset": 0})
    body = resp.json()
    assert len(body["data"]) == 2
    assert body["meta"]["total"] == 5


def test_list_epics_sort(client) -> None:
    client.post("/v1/planning/epics", json={"project_id": "p1", "title": "Bravo"})
    client.post("/v1/planning/epics", json={"project_id": "p1", "title": "Alpha"})

    resp = client.get("/v1/planning/epics", params={"sort": "title"})
    data = resp.json()["data"]
    assert data[0]["title"] == "Alpha"
    assert data[1]["title"] == "Bravo"


def test_list_epics_sort_invalid_column(client) -> None:
    resp = client.get("/v1/planning/epics", params={"sort": "nonexistent"})
    assert resp.status_code == 400
    assert "Invalid sort field" in resp.json()["error"]["message"]


# ── Get single ────────────────────────────────────────────────────────────


def test_get_epic(client) -> None:
    create_resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "My Epic"},
    )
    epic_id = create_resp.json()["data"]["id"]

    resp = client.get(f"/v1/planning/epics/{epic_id}")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["id"] == epic_id
    assert data["title"] == "My Epic"
    assert data["story_count"] == 0


def test_get_epic_not_found(client) -> None:
    resp = client.get("/v1/planning/epics/nonexistent")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_get_epic_includes_story_count(client, _setup_test_db) -> None:
    create_resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Epic With Stories"},
    )
    epic_id = create_resp.json()["data"]["id"]

    # Direct DB access: stories CRUD is not yet exposed via the API, so we
    # insert test stories directly to verify the story_count aggregation.
    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(
        "INSERT INTO stories (id, project_id, epic_id, title, story_type, status, "
        "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("s-count-1", "p1", epic_id, "Story 1", "USER_STORY", "TODO", TS, TS),
    )
    conn.execute(
        "INSERT INTO stories (id, project_id, epic_id, title, story_type, status, "
        "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("s-count-2", "p1", epic_id, "Story 2", "USER_STORY", "TODO", TS, TS),
    )
    conn.commit()
    conn.close()

    resp = client.get(f"/v1/planning/epics/{epic_id}")
    assert resp.json()["data"]["story_count"] == 2


# ── Update ────────────────────────────────────────────────────────────────


def test_update_epic_title(client) -> None:
    create_resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Old Title"},
    )
    epic_id = create_resp.json()["data"]["id"]

    resp = client.patch(f"/v1/planning/epics/{epic_id}", json={"title": "New Title"})
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] == "New Title"


def test_update_epic_description(client) -> None:
    create_resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Ep"},
    )
    epic_id = create_resp.json()["data"]["id"]

    resp = client.patch(
        f"/v1/planning/epics/{epic_id}",
        json={"description": "New desc"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["description"] == "New desc"


def test_update_epic_status_sets_override(client) -> None:
    create_resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Ep"},
    )
    epic_id = create_resp.json()["data"]["id"]

    resp = client.patch(f"/v1/planning/epics/{epic_id}", json={"status": "IN_PROGRESS"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["status"] == "IN_PROGRESS"
    assert data["status_mode"] == "MANUAL"
    assert data["status_override"] == "IN_PROGRESS"
    assert data["status_override_set_at"] is not None


def test_update_epic_not_found(client) -> None:
    resp = client.patch("/v1/planning/epics/nope", json={"title": "X"})
    assert resp.status_code == 404


def test_update_epic_invalid_status(client) -> None:
    create_resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Ep"},
    )
    epic_id = create_resp.json()["data"]["id"]

    resp = client.patch(f"/v1/planning/epics/{epic_id}", json={"status": "INVALID"})
    assert resp.status_code == 422


# ── Delete ────────────────────────────────────────────────────────────────


def test_delete_epic(client) -> None:
    create_resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Doomed"},
    )
    epic_id = create_resp.json()["data"]["id"]

    resp = client.delete(f"/v1/planning/epics/{epic_id}")
    assert resp.status_code == 204

    get_resp = client.get(f"/v1/planning/epics/{epic_id}")
    assert get_resp.status_code == 404


def test_delete_epic_not_found(client) -> None:
    resp = client.delete("/v1/planning/epics/nonexistent")
    assert resp.status_code == 404


def test_delete_epic_sets_null_on_stories(client, _setup_test_db) -> None:
    create_resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Parent Epic"},
    )
    epic_id = create_resp.json()["data"]["id"]

    # Direct DB access: stories CRUD is not yet exposed via the API, so we
    # insert and query stories directly to verify ON DELETE SET NULL behavior.
    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(
        "INSERT INTO stories (id, project_id, epic_id, title, story_type, status, "
        "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("s-del-1", "p1", epic_id, "Child Story", "USER_STORY", "TODO", TS, TS),
    )
    conn.commit()

    client.delete(f"/v1/planning/epics/{epic_id}")

    row = conn.execute("SELECT epic_id FROM stories WHERE id = 's-del-1'").fetchone()
    conn.close()
    assert row is not None
    assert row[0] is None  # ON DELETE SET NULL


# ── Key filter ────────────────────────────────────────────────────────────


def test_list_epics_filter_by_key(client):
    # Create an epic with a project to get an auto-generated key
    resp = client.post(
        "/v1/planning/epics",
        json={"title": "Keyed epic", "project_id": "p1"},
    )
    assert resp.status_code == 201
    key = resp.json()["data"]["key"]
    assert key is not None

    resp = client.get(f"/v1/planning/epics?key={key}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 1
    assert body["data"][0]["key"] == key


def test_list_epics_filter_by_key_no_match(client):
    resp = client.get("/v1/planning/epics?key=NONEXISTENT-999")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 0
    assert body["data"] == []


# ── project_key resolver ─────────────────────────────────────────────────


def test_list_epics_by_project_key(client):
    client.post("/v1/planning/epics", json={"project_id": "p1", "title": "E1"})
    client.post("/v1/planning/epics", json={"project_id": "p2", "title": "E2"})
    resp = client.get("/v1/planning/epics?project_key=P1")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) > 0
    assert all(e["project_id"] == "p1" for e in data)


def test_list_epics_project_key_not_found(client):
    resp = client.get("/v1/planning/epics?project_key=NOPE")
    assert resp.status_code == 404


def test_list_epics_project_key_case_insensitive(client):
    client.post("/v1/planning/epics", json={"project_id": "p1", "title": "E1"})
    resp = client.get("/v1/planning/epics?project_key=p1")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) > 0
    assert all(e["project_id"] == "p1" for e in data)
