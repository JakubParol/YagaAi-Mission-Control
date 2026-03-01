"""
Integration tests for the Projects CRUD API.

Covers: POST /v1/planning/projects, GET list, GET single,
PATCH update, DELETE, plus business rules (duplicate key, default backlog
creation, key uppercasing).
"""

PREFIX = "/v1/planning/projects"


# ── Create ───────────────────────────────────────────────────────────────


def test_create_project(client):
    resp = client.post(PREFIX, json={"key": "NEW", "name": "New Project"})
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["key"] == "NEW"
    assert data["name"] == "New Project"
    assert data["status"] == "ACTIVE"
    assert data["description"] is None
    assert data["repo_root"] is None


def test_create_project_with_all_fields(client):
    resp = client.post(
        PREFIX,
        json={
            "key": "FULL",
            "name": "Full Project",
            "description": "A description",
            "repo_root": "/home/user/repo",
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["description"] == "A description"
    assert data["repo_root"] == "/home/user/repo"


def test_create_project_creates_default_backlog(client):
    resp = client.post(PREFIX, json={"key": "BKL", "name": "Backlog Test"})
    assert resp.status_code == 201
    project_id = resp.json()["data"]["id"]

    backlogs = client.get(f"/v1/planning/backlogs?project_id={project_id}").json()
    assert backlogs["meta"]["total"] == 1
    bl = backlogs["data"][0]
    assert bl["name"] == "BKL Backlog"
    assert bl["kind"] == "BACKLOG"
    assert bl["is_default"] is True


def test_create_project_creates_counter(client):
    client.post(PREFIX, json={"key": "CTR", "name": "Counter Test"})
    project_id = client.get(PREFIX).json()["data"]
    proj = [p for p in project_id if p["key"] == "CTR"][0]

    epic_resp = client.post(
        "/v1/planning/epics",
        json={"project_id": proj["id"], "title": "E1"},
    )
    assert epic_resp.status_code == 201
    assert epic_resp.json()["data"]["key"] == "CTR-1"


def test_create_project_duplicate_key_conflict(client):
    client.post(PREFIX, json={"key": "DUP", "name": "First"})
    resp = client.post(PREFIX, json={"key": "DUP", "name": "Second"})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CONFLICT"


def test_create_project_empty_name_validation(client):
    resp = client.post(PREFIX, json={"key": "BAD", "name": ""})
    assert resp.status_code == 422


def test_create_project_invalid_key_format(client):
    resp = client.post(PREFIX, json={"key": "bad", "name": "Lowercase Key"})
    assert resp.status_code == 422


def test_create_project_key_too_long(client):
    resp = client.post(PREFIX, json={"key": "A" * 11, "name": "Long Key"})
    assert resp.status_code == 422


# ── List ─────────────────────────────────────────────────────────────────


def test_list_projects_seeded(client):
    resp = client.get(PREFIX)
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 2
    assert len(body["data"]) == 2


def test_list_projects_filter_by_status(client):
    resp = client.get(f"{PREFIX}?status=ACTIVE")
    assert resp.status_code == 200
    assert resp.json()["meta"]["total"] == 2


def test_list_projects_pagination(client):
    resp = client.get(f"{PREFIX}?limit=1&offset=0")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["meta"]["total"] == 2
    assert body["meta"]["limit"] == 1
    assert body["meta"]["offset"] == 0


def test_list_projects_sort_by_name(client):
    resp = client.get(f"{PREFIX}?sort=name")
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()["data"]]
    assert names == sorted(names)


def test_list_projects_sort_invalid_column(client):
    resp = client.get(f"{PREFIX}?sort=nonexistent")
    assert resp.status_code == 400


# ── Get single ───────────────────────────────────────────────────────────


def test_get_project(client):
    resp = client.get(f"{PREFIX}/p1")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["id"] == "p1"
    assert data["key"] == "P1"
    assert data["name"] == "Project 1"


def test_get_project_not_found(client):
    resp = client.get(f"{PREFIX}/nonexistent")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


# ── Update ───────────────────────────────────────────────────────────────


def test_update_project_name(client):
    resp = client.patch(f"{PREFIX}/p1", json={"name": "Renamed"})
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "Renamed"


def test_update_project_description(client):
    resp = client.patch(f"{PREFIX}/p1", json={"description": "New desc"})
    assert resp.status_code == 200
    assert resp.json()["data"]["description"] == "New desc"


def test_update_project_status_to_archived(client):
    resp = client.patch(f"{PREFIX}/p1", json={"status": "ARCHIVED"})
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "ARCHIVED"


def test_update_project_repo_root(client):
    resp = client.patch(f"{PREFIX}/p1", json={"repo_root": "/new/path"})
    assert resp.status_code == 200
    assert resp.json()["data"]["repo_root"] == "/new/path"


def test_update_project_not_found(client):
    resp = client.patch(f"{PREFIX}/nonexistent", json={"name": "X"})
    assert resp.status_code == 404


def test_update_project_invalid_status(client):
    resp = client.patch(f"{PREFIX}/p1", json={"status": "INVALID"})
    assert resp.status_code == 422


# ── Delete ───────────────────────────────────────────────────────────────


def test_delete_project(client):
    resp = client.delete(f"{PREFIX}/p1")
    assert resp.status_code == 204

    get_resp = client.get(f"{PREFIX}/p1")
    assert get_resp.status_code == 404


def test_delete_project_not_found(client):
    resp = client.delete(f"{PREFIX}/nonexistent")
    assert resp.status_code == 404


def test_delete_project_cascades_epics(client):
    epic_resp = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Will cascade"},
    )
    epic_id = epic_resp.json()["data"]["id"]

    client.delete(f"{PREFIX}/p1")

    get_resp = client.get(f"/v1/planning/epics/{epic_id}")
    assert get_resp.status_code == 404
