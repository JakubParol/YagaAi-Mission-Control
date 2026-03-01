"""
Integration tests for the Backlogs CRUD API.

Covers: POST /v1/planning/backlogs, GET list (with project_id="null" global
filter), GET single (with counts), PATCH update, DELETE, plus business rules
(cannot delete default backlog, cannot manually set is_default).
"""

PREFIX = "/v1/planning/backlogs"


# ── Create ───────────────────────────────────────────────────────────────


def test_create_backlog_for_project(client):
    resp = client.post(
        PREFIX,
        json={"project_id": "p1", "name": "Sprint 1", "kind": "SPRINT"},
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["project_id"] == "p1"
    assert data["name"] == "Sprint 1"
    assert data["kind"] == "SPRINT"
    assert data["status"] == "ACTIVE"
    assert data["is_default"] is False


def test_create_global_backlog(client):
    resp = client.post(PREFIX, json={"name": "Ideas", "kind": "IDEAS"})
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["project_id"] is None
    assert data["kind"] == "IDEAS"


def test_create_backlog_with_all_fields(client):
    resp = client.post(
        PREFIX,
        json={
            "project_id": "p1",
            "name": "Full Sprint",
            "kind": "SPRINT",
            "goal": "Ship v1",
            "start_date": "2026-03-01",
            "end_date": "2026-03-15",
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["goal"] == "Ship v1"
    assert data["start_date"] == "2026-03-01"
    assert data["end_date"] == "2026-03-15"


def test_create_backlog_empty_name_validation(client):
    resp = client.post(PREFIX, json={"name": "", "kind": "BACKLOG"})
    assert resp.status_code == 422


def test_create_backlog_invalid_kind(client):
    resp = client.post(PREFIX, json={"name": "Bad", "kind": "INVALID"})
    assert resp.status_code == 422


# ── List ─────────────────────────────────────────────────────────────────


def test_list_backlogs_seeded(client):
    resp = client.get(PREFIX)
    assert resp.status_code == 200
    assert resp.json()["meta"]["total"] == 3


def test_list_backlogs_filter_by_project(client):
    resp = client.get(f"{PREFIX}?project_id=p1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 2
    for bl in body["data"]:
        assert bl["project_id"] == "p1"


def test_list_backlogs_filter_global(client):
    resp = client.get(f"{PREFIX}?project_id=null")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 1
    assert body["data"][0]["project_id"] is None


def test_list_backlogs_filter_by_status(client):
    resp = client.get(f"{PREFIX}?status=ACTIVE")
    assert resp.status_code == 200
    assert resp.json()["meta"]["total"] == 3


def test_list_backlogs_filter_by_kind(client):
    resp = client.get(f"{PREFIX}?kind=SPRINT")
    assert resp.status_code == 200
    body = resp.json()
    for bl in body["data"]:
        assert bl["kind"] == "SPRINT"


def test_list_backlogs_pagination(client):
    resp = client.get(f"{PREFIX}?limit=1&offset=0")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["meta"]["total"] == 3


def test_list_backlogs_sort_by_name(client):
    resp = client.get(f"{PREFIX}?sort=name")
    assert resp.status_code == 200
    names = [b["name"] for b in resp.json()["data"]]
    assert names == sorted(names)


def test_list_backlogs_sort_invalid_column(client):
    resp = client.get(f"{PREFIX}?sort=nonexistent")
    assert resp.status_code == 400


# ── Get single ───────────────────────────────────────────────────────────


def test_get_backlog(client):
    resp = client.get(f"{PREFIX}/b1")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["id"] == "b1"
    assert data["name"] == "P1 Backlog"


def test_get_backlog_includes_counts(client):
    client.post(
        f"{PREFIX}/b1/stories",
        json={"story_id": "s1", "position": 0},
    )
    client.post(
        f"{PREFIX}/b1/tasks",
        json={"task_id": "t1", "position": 0},
    )

    resp = client.get(f"{PREFIX}/b1")
    assert resp.status_code == 200
    meta = resp.json()["meta"]
    assert meta["story_count"] == 1
    assert meta["task_count"] == 1


def test_get_backlog_not_found(client):
    resp = client.get(f"{PREFIX}/nonexistent")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


# ── Update ───────────────────────────────────────────────────────────────


def test_update_backlog_name(client):
    resp = client.patch(f"{PREFIX}/b1", json={"name": "Renamed"})
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "Renamed"


def test_update_backlog_status_to_closed(client):
    resp = client.patch(f"{PREFIX}/b1", json={"status": "CLOSED"})
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "CLOSED"


def test_update_backlog_goal(client):
    resp = client.patch(f"{PREFIX}/b1", json={"goal": "New goal"})
    assert resp.status_code == 200
    assert resp.json()["data"]["goal"] == "New goal"


def test_update_backlog_not_found(client):
    resp = client.patch(f"{PREFIX}/nonexistent", json={"name": "X"})
    assert resp.status_code == 404


def test_update_backlog_invalid_status(client):
    resp = client.patch(f"{PREFIX}/b1", json={"status": "INVALID"})
    assert resp.status_code == 422


def test_update_backlog_ignores_unknown_fields(client):
    """Unknown fields like is_default are silently ignored by the schema."""
    resp = client.patch(f"{PREFIX}/b1", json={"is_default": True, "name": "Updated"})
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "Updated"
    assert resp.json()["data"]["is_default"] is False


# ── Delete ───────────────────────────────────────────────────────────────


def test_delete_backlog(client):
    resp = client.delete(f"{PREFIX}/b1")
    assert resp.status_code == 204

    get_resp = client.get(f"{PREFIX}/b1")
    assert get_resp.status_code == 404


def test_delete_backlog_not_found(client):
    resp = client.delete(f"{PREFIX}/nonexistent")
    assert resp.status_code == 404


def test_delete_default_backlog_rejected(client, _setup_test_db):
    """Cannot delete a backlog that is the project default."""
    import sqlite3

    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO backlogs (id, project_id, name, kind, status, is_default, "
        "created_at, updated_at) VALUES "
        "('bdef2', 'p2', 'Default', 'BACKLOG', 'ACTIVE', 1, "
        "'2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
    )
    conn.commit()
    conn.close()

    resp = client.delete(f"{PREFIX}/bdef2")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


# ── project_key resolver ─────────────────────────────────────────────────


def test_list_backlogs_by_project_key(client):
    resp = client.get(f"{PREFIX}?project_key=P1")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) > 0
    assert all(b["project_id"] == "p1" for b in data)


def test_list_backlogs_project_key_not_found(client):
    resp = client.get(f"{PREFIX}?project_key=NOPE")
    assert resp.status_code == 404


def test_list_backlogs_null_project_id_still_works(client):
    resp = client.get(f"{PREFIX}?project_id=null")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert any(b["project_id"] is None for b in data)
