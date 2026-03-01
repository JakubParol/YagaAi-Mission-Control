"""
Integration tests for the stories CRUD API.

Coverage:
- POST /v1/planning/stories — create with/without project, with epic, key generation
- GET /v1/planning/stories — list with project/epic/status filters, pagination, sorting
- GET /v1/planning/stories/{id} — single story with task_count aggregation
- PATCH /v1/planning/stories/{id} — update fields, status override, completed_at lifecycle
- DELETE /v1/planning/stories/{id} — hard delete, ON DELETE SET NULL on tasks
- POST /v1/planning/stories/{id}/labels — attach label (conflict, not found)
- DELETE /v1/planning/stories/{id}/labels/{label_id} — detach label

Fixtures:
- client — FastAPI TestClient (from conftest)
- _setup_test_db — in-memory SQLite with schema + seed data (from conftest)
"""

import sqlite3

TS = "2026-01-01T00:00:00Z"


# ── Create ────────────────────────────────────────────────────────────────


def test_create_story_with_project(client) -> None:
    resp = client.post(
        "/v1/planning/stories",
        json={"title": "Auth Story", "story_type": "USER_STORY", "project_id": "p1"},
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["project_id"] == "p1"
    assert data["key"] == "P1-1"
    assert data["title"] == "Auth Story"
    assert data["story_type"] == "USER_STORY"
    assert data["status"] == "TODO"
    assert data["status_mode"] == "MANUAL"
    assert data["is_blocked"] is False
    assert "id" in data
    assert "created_at" in data


def test_create_story_without_project(client) -> None:
    resp = client.post(
        "/v1/planning/stories",
        json={"title": "Global Story", "story_type": "SPIKE"},
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["project_id"] is None
    assert data["key"] is None


def test_create_story_with_epic(client) -> None:
    epic_resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Parent Epic"},
    )
    epic_id = epic_resp.json()["data"]["id"]

    resp = client.post(
        "/v1/planning/stories",
        json={
            "title": "Child Story",
            "story_type": "USER_STORY",
            "project_id": "p1",
            "epic_id": epic_id,
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["epic_id"] == epic_id
    assert data["key"] == "P1-2"  # epic took P1-1


def test_create_story_with_all_fields(client) -> None:
    resp = client.post(
        "/v1/planning/stories",
        json={
            "title": "Full Story",
            "story_type": "USER_STORY",
            "project_id": "p1",
            "intent": "Test intent",
            "description": "Test description",
            "priority": 3,
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["intent"] == "Test intent"
    assert data["description"] == "Test description"
    assert data["priority"] == 3


def test_create_story_increments_counter(client) -> None:
    resp1 = client.post(
        "/v1/planning/stories",
        json={"title": "Story 1", "story_type": "USER_STORY", "project_id": "p1"},
    )
    resp2 = client.post(
        "/v1/planning/stories",
        json={"title": "Story 2", "story_type": "USER_STORY", "project_id": "p1"},
    )
    assert resp1.json()["data"]["key"] == "P1-1"
    assert resp2.json()["data"]["key"] == "P1-2"


def test_create_story_nonexistent_project(client) -> None:
    resp = client.post(
        "/v1/planning/stories",
        json={"title": "Bad", "story_type": "USER_STORY", "project_id": "nope"},
    )
    assert resp.status_code == 400


def test_create_story_nonexistent_epic(client) -> None:
    resp = client.post(
        "/v1/planning/stories",
        json={
            "title": "Bad",
            "story_type": "USER_STORY",
            "project_id": "p1",
            "epic_id": "nope",
        },
    )
    assert resp.status_code == 400


def test_create_story_empty_title(client) -> None:
    resp = client.post(
        "/v1/planning/stories",
        json={"title": "", "story_type": "USER_STORY"},
    )
    assert resp.status_code == 422


# ── List ──────────────────────────────────────────────────────────────────


def test_list_stories_empty(client) -> None:
    # The conftest inserts seed stories, but we can filter by a project with none
    resp = client.get("/v1/planning/stories", params={"project_id": "p2"})
    assert resp.status_code == 200
    body = resp.json()
    # p2 has one seeded story (sp2)
    assert body["meta"]["total"] == 1


def test_list_stories_with_data(client) -> None:
    client.post(
        "/v1/planning/stories",
        json={"title": "S1", "story_type": "USER_STORY", "project_id": "p1"},
    )
    client.post(
        "/v1/planning/stories",
        json={"title": "S2", "story_type": "USER_STORY", "project_id": "p1"},
    )

    resp = client.get("/v1/planning/stories", params={"project_id": "p1"})
    assert resp.status_code == 200
    # p1 had 2 seeded stories + 2 new = 4
    assert resp.json()["meta"]["total"] == 4


def test_list_stories_filter_by_epic(client) -> None:
    epic_resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Filter Epic"},
    )
    epic_id = epic_resp.json()["data"]["id"]

    client.post(
        "/v1/planning/stories",
        json={
            "title": "S1",
            "story_type": "USER_STORY",
            "project_id": "p1",
            "epic_id": epic_id,
        },
    )
    client.post(
        "/v1/planning/stories",
        json={"title": "S2", "story_type": "USER_STORY", "project_id": "p1"},
    )

    resp = client.get("/v1/planning/stories", params={"epic_id": epic_id})
    assert resp.json()["meta"]["total"] == 1


def test_list_stories_filter_by_status(client) -> None:
    story_id = client.post(
        "/v1/planning/stories",
        json={"title": "S1", "story_type": "USER_STORY", "project_id": "p1"},
    ).json()["data"]["id"]
    client.patch(f"/v1/planning/stories/{story_id}", json={"status": "IN_PROGRESS"})

    resp = client.get("/v1/planning/stories", params={"status": "IN_PROGRESS"})
    assert resp.json()["meta"]["total"] == 1


def test_list_stories_pagination(client) -> None:
    for i in range(5):
        client.post(
            "/v1/planning/stories",
            json={"title": f"S{i}", "story_type": "USER_STORY", "project_id": "p1"},
        )

    resp = client.get(
        "/v1/planning/stories",
        params={"project_id": "p1", "limit": 2, "offset": 0},
    )
    body = resp.json()
    assert len(body["data"]) == 2
    # 2 seeded + 5 new = 7
    assert body["meta"]["total"] == 7


def test_list_stories_sort(client) -> None:
    client.post(
        "/v1/planning/stories",
        json={"title": "Bravo", "story_type": "USER_STORY", "project_id": "p2"},
    )
    client.post(
        "/v1/planning/stories",
        json={"title": "Alpha", "story_type": "USER_STORY", "project_id": "p2"},
    )

    resp = client.get("/v1/planning/stories", params={"project_id": "p2", "sort": "title"})
    data = resp.json()["data"]
    titles = [d["title"] for d in data]
    assert titles == sorted(titles)


def test_list_stories_sort_invalid(client) -> None:
    resp = client.get("/v1/planning/stories", params={"sort": "nonexistent"})
    assert resp.status_code == 400
    assert "Invalid sort field" in resp.json()["error"]["message"]


# ── Get single ────────────────────────────────────────────────────────────


def test_get_story(client) -> None:
    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "My Story", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    resp = client.get(f"/v1/planning/stories/{story_id}")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["id"] == story_id
    assert data["title"] == "My Story"
    assert data["task_count"] == 0


def test_get_story_not_found(client) -> None:
    resp = client.get("/v1/planning/stories/nonexistent")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_get_story_includes_task_count(client, _setup_test_db) -> None:
    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "Story With Tasks", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(
        "INSERT INTO tasks (id, project_id, story_id, title, task_type, status, "
        "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("t-cnt-1", "p1", story_id, "Task 1", "TASK", "TODO", TS, TS),
    )
    conn.execute(
        "INSERT INTO tasks (id, project_id, story_id, title, task_type, status, "
        "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("t-cnt-2", "p1", story_id, "Task 2", "TASK", "TODO", TS, TS),
    )
    conn.commit()
    conn.close()

    resp = client.get(f"/v1/planning/stories/{story_id}")
    assert resp.json()["data"]["task_count"] == 2


# ── Update ────────────────────────────────────────────────────────────────


def test_update_story_title(client) -> None:
    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "Old Title", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    resp = client.patch(f"/v1/planning/stories/{story_id}", json={"title": "New Title"})
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] == "New Title"


def test_update_story_description(client) -> None:
    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "St", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    resp = client.patch(
        f"/v1/planning/stories/{story_id}",
        json={"description": "New desc"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["description"] == "New desc"


def test_update_story_status_sets_override(client) -> None:
    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "St", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    resp = client.patch(f"/v1/planning/stories/{story_id}", json={"status": "IN_PROGRESS"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["status"] == "IN_PROGRESS"
    assert data["status_mode"] == "MANUAL"
    assert data["status_override"] == "IN_PROGRESS"
    assert data["status_override_set_at"] is not None


def test_update_story_status_done_sets_completed_at(client) -> None:
    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "St", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]
    assert create_resp.json()["data"]["completed_at"] is None

    resp = client.patch(f"/v1/planning/stories/{story_id}", json={"status": "DONE"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["status"] == "DONE"
    assert data["completed_at"] is not None


def test_update_story_status_away_from_done_clears_completed_at(client) -> None:
    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "St", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    client.patch(f"/v1/planning/stories/{story_id}", json={"status": "DONE"})
    resp = client.patch(f"/v1/planning/stories/{story_id}", json={"status": "TODO"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["status"] == "TODO"
    assert data["completed_at"] is None


def test_update_story_not_found(client) -> None:
    resp = client.patch("/v1/planning/stories/nope", json={"title": "X"})
    assert resp.status_code == 404


def test_update_story_invalid_status(client) -> None:
    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "St", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    resp = client.patch(f"/v1/planning/stories/{story_id}", json={"status": "INVALID"})
    assert resp.status_code == 422


# ── Delete ────────────────────────────────────────────────────────────────


def test_delete_story(client) -> None:
    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "Doomed", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    resp = client.delete(f"/v1/planning/stories/{story_id}")
    assert resp.status_code == 204

    get_resp = client.get(f"/v1/planning/stories/{story_id}")
    assert get_resp.status_code == 404


def test_delete_story_not_found(client) -> None:
    resp = client.delete("/v1/planning/stories/nonexistent")
    assert resp.status_code == 404


def test_delete_story_sets_null_on_tasks(client, _setup_test_db) -> None:
    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "Parent Story", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(
        "INSERT INTO tasks (id, project_id, story_id, title, task_type, status, "
        "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("t-del-1", "p1", story_id, "Child Task", "TASK", "TODO", TS, TS),
    )
    conn.commit()

    client.delete(f"/v1/planning/stories/{story_id}")

    row = conn.execute("SELECT story_id FROM tasks WHERE id = 't-del-1'").fetchone()
    conn.close()
    assert row is not None
    assert row[0] is None  # tasks.story_id references stories(id) ON DELETE SET NULL


# ── Labels ────────────────────────────────────────────────────────────────


def test_attach_label(client, _setup_test_db) -> None:
    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO labels (id, project_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
        ("lbl-1", "p1", "bug", "red", TS),
    )
    conn.commit()
    conn.close()

    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "Labeled Story", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    resp = client.post(
        f"/v1/planning/stories/{story_id}/labels",
        json={"label_id": "lbl-1"},
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["story_id"] == story_id
    assert data["label_id"] == "lbl-1"


def test_attach_label_duplicate(client, _setup_test_db) -> None:
    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO labels (id, project_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
        ("lbl-dup", "p1", "feature", "blue", TS),
    )
    conn.commit()
    conn.close()

    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "Dup Label", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    client.post(f"/v1/planning/stories/{story_id}/labels", json={"label_id": "lbl-dup"})
    resp = client.post(f"/v1/planning/stories/{story_id}/labels", json={"label_id": "lbl-dup"})
    assert resp.status_code == 409


def test_attach_label_story_not_found(client, _setup_test_db) -> None:
    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO labels (id, project_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
        ("lbl-nf", "p1", "nf", "green", TS),
    )
    conn.commit()
    conn.close()

    resp = client.post("/v1/planning/stories/nope/labels", json={"label_id": "lbl-nf"})
    assert resp.status_code == 404


def test_attach_label_nonexistent(client) -> None:
    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "S", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    resp = client.post(f"/v1/planning/stories/{story_id}/labels", json={"label_id": "nope"})
    assert resp.status_code == 400


def test_detach_label(client, _setup_test_db) -> None:
    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO labels (id, project_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
        ("lbl-det", "p1", "detach", "yellow", TS),
    )
    conn.commit()
    conn.close()

    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "Detach Story", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    client.post(f"/v1/planning/stories/{story_id}/labels", json={"label_id": "lbl-det"})
    resp = client.delete(f"/v1/planning/stories/{story_id}/labels/lbl-det")
    assert resp.status_code == 204


def test_detach_label_not_attached(client) -> None:
    create_resp = client.post(
        "/v1/planning/stories",
        json={"title": "S", "story_type": "USER_STORY", "project_id": "p1"},
    )
    story_id = create_resp.json()["data"]["id"]

    resp = client.delete(f"/v1/planning/stories/{story_id}/labels/nonexistent")
    assert resp.status_code == 404


def test_detach_label_story_not_found(client) -> None:
    resp = client.delete("/v1/planning/stories/nope/labels/any-label")
    assert resp.status_code == 404


# ── Key filter ────────────────────────────────────────────────────────────


def test_list_stories_filter_by_key(client):
    # Create a story with a project to get an auto-generated key
    resp = client.post(
        "/v1/planning/stories",
        json={"title": "Keyed story", "story_type": "USER_STORY", "project_id": "p1"},
    )
    assert resp.status_code == 201
    key = resp.json()["data"]["key"]
    assert key is not None

    resp = client.get(f"/v1/planning/stories?key={key}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 1
    assert body["data"][0]["key"] == key


def test_list_stories_filter_by_key_no_match(client):
    resp = client.get("/v1/planning/stories?key=NONEXISTENT-999")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 0
    assert body["data"] == []
