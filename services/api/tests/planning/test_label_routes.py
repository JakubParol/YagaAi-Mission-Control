"""
Integration tests for the Labels CRUD API.

Covers: POST /v1/planning/labels, GET list (with project_id="null" global
filter), GET single, DELETE, plus duplicate name conflict and validation.
"""

PREFIX = "/v1/planning/labels"


# ── Create ───────────────────────────────────────────────────────────────


def test_create_global_label(client):
    resp = client.post(PREFIX, json={"name": "bug"})
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["name"] == "bug"
    assert data["project_id"] is None
    assert data["color"] is None


def test_create_project_label(client):
    resp = client.post(PREFIX, json={"name": "feature", "project_id": "p1", "color": "#ff0000"})
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["name"] == "feature"
    assert data["project_id"] == "p1"
    assert data["color"] == "#ff0000"


def test_create_label_duplicate_global_name_conflict(client):
    client.post(PREFIX, json={"name": "dup-global"})
    resp = client.post(PREFIX, json={"name": "dup-global"})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CONFLICT"


def test_create_label_duplicate_project_name_conflict(client):
    client.post(PREFIX, json={"name": "dup-proj", "project_id": "p1"})
    resp = client.post(PREFIX, json={"name": "dup-proj", "project_id": "p1"})
    assert resp.status_code == 409


def test_create_label_same_name_different_project_ok(client):
    r1 = client.post(PREFIX, json={"name": "shared", "project_id": "p1"})
    r2 = client.post(PREFIX, json={"name": "shared", "project_id": "p2"})
    assert r1.status_code == 201
    assert r2.status_code == 201


def test_create_label_empty_name_validation(client):
    resp = client.post(PREFIX, json={"name": ""})
    assert resp.status_code == 422


# ── List ─────────────────────────────────────────────────────────────────


def test_list_labels_empty(client):
    resp = client.get(PREFIX)
    assert resp.status_code == 200
    assert resp.json()["meta"]["total"] == 0


def test_list_labels_with_data(client):
    client.post(PREFIX, json={"name": "a"})
    client.post(PREFIX, json={"name": "b"})
    resp = client.get(PREFIX)
    assert resp.status_code == 200
    assert resp.json()["meta"]["total"] == 2


def test_list_labels_filter_by_project(client):
    client.post(PREFIX, json={"name": "proj-label", "project_id": "p1"})
    client.post(PREFIX, json={"name": "global-label"})

    resp = client.get(f"{PREFIX}?project_id=p1")
    assert resp.status_code == 200
    names = {l["name"] for l in resp.json()["data"]}
    assert "proj-label" in names
    assert "global-label" in names


def test_list_labels_filter_global_only(client):
    client.post(PREFIX, json={"name": "proj-only", "project_id": "p1"})
    client.post(PREFIX, json={"name": "global-only"})

    resp = client.get(f"{PREFIX}?project_id=null")
    assert resp.status_code == 200
    names = {l["name"] for l in resp.json()["data"]}
    assert "global-only" in names
    assert "proj-only" not in names


def test_list_labels_pagination(client):
    client.post(PREFIX, json={"name": "x"})
    client.post(PREFIX, json={"name": "y"})
    client.post(PREFIX, json={"name": "z"})

    resp = client.get(f"{PREFIX}?limit=2&offset=0")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 2
    assert body["meta"]["total"] == 3


# ── Get single ───────────────────────────────────────────────────────────


def test_get_label(client):
    create_resp = client.post(PREFIX, json={"name": "get-me"})
    label_id = create_resp.json()["data"]["id"]

    resp = client.get(f"{PREFIX}/{label_id}")
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "get-me"


def test_get_label_not_found(client):
    resp = client.get(f"{PREFIX}/nonexistent")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


# ── Delete ───────────────────────────────────────────────────────────────


def test_delete_label(client):
    create_resp = client.post(PREFIX, json={"name": "delete-me"})
    label_id = create_resp.json()["data"]["id"]

    resp = client.delete(f"{PREFIX}/{label_id}")
    assert resp.status_code == 204

    get_resp = client.get(f"{PREFIX}/{label_id}")
    assert get_resp.status_code == 404


def test_delete_label_not_found(client):
    resp = client.delete(f"{PREFIX}/nonexistent")
    assert resp.status_code == 404
