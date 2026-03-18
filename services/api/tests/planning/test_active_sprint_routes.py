"""
Integration tests for the active sprint board endpoint.

Covers: GET /v1/planning/backlogs/active-sprint?project_id=...
- Returns active sprint with items ordered by rank
- Returns 404 when no active sprint exists
- Returns 422 when project_id is missing
- Returns empty items list for sprint with no items

Note: Seed data (conftest) includes b2 = SPRINT/ACTIVE for project p1.
Tests that need a clean slate for sprints use project p2 (no seeded sprint).
"""

from tests.support.postgres_compat import pg_connect

PREFIX = "/v1/planning/backlogs"
ACTIVE_SPRINT_URL = f"{PREFIX}/active-sprint"
TS = "2026-01-01T00:00:00Z"


# ── Setup helpers ───────────────────────────────────────────────────────


def _ensure_product_backlog(client, project_id):
    """Return the product backlog id for a project, creating one if needed."""
    resp = client.get(f"{PREFIX}?project_id={project_id}&kind=BACKLOG")
    if resp.status_code == 200:
        backlogs = resp.json()["data"]
        if backlogs:
            return backlogs[0]["id"]
    create_resp = client.post(
        PREFIX,
        json={"project_id": project_id, "name": "Product Backlog", "kind": "BACKLOG"},
    )
    assert create_resp.status_code == 201
    return create_resp.json()["data"]["id"]


def _create_sprint(client, project_id="p2", name="Sprint 1", status="ACTIVE"):
    """Create a sprint backlog and return its id."""
    resp = client.post(
        PREFIX,
        json={"project_id": project_id, "name": name, "kind": "SPRINT"},
    )
    assert resp.status_code == 201
    backlog_id = resp.json()["data"]["id"]
    if status in ("ACTIVE", "CLOSED"):
        start_resp = client.post(f"{PREFIX}/{backlog_id}/start?project_id={project_id}")
        assert start_resp.status_code == 200
    if status == "CLOSED":
        target_id = _ensure_product_backlog(client, project_id)
        complete_resp = client.post(
            f"{PREFIX}/{backlog_id}/complete?project_id={project_id}",
            json={"target_backlog_id": target_id},
        )
        assert complete_resp.status_code == 200
    return backlog_id


def _add_item(client, backlog_id, work_item_id):
    resp = client.post(
        f"{PREFIX}/{backlog_id}/items",
        json={"work_item_id": work_item_id},
    )
    assert resp.status_code == 201
    return resp


# ── Happy path: seeded sprint b2 (p1) ──────────────────────────────────


def test_active_sprint_returns_seeded_sprint(client):
    """Seeded b2 is an active sprint for p1."""
    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert resp.status_code == 200

    data = resp.json()["data"]
    backlog = data["backlog"]
    assert backlog["id"] == "b2"
    assert backlog["kind"] == "SPRINT"
    assert backlog["status"] == "ACTIVE"
    assert backlog["project_id"] == "p1"
    assert data["items"] == []


def test_active_sprint_with_items(client):
    """Add items to seeded sprint b2 and verify they appear."""
    _add_item(client, "b2", "s1")
    _add_item(client, "b2", "s2")

    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert resp.status_code == 200

    items = resp.json()["data"]["items"]
    assert len(items) == 2
    ids = [i["id"] for i in items]
    assert "s1" in ids
    assert "s2" in ids


def test_active_sprint_item_fields(client):
    """Verify all expected fields are present on sprint items."""
    _add_item(client, "b2", "s1")

    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert resp.status_code == 200

    item = resp.json()["data"]["items"][0]
    assert item["id"] == "s1"
    assert "title" in item
    assert "status" in item
    assert "priority" in item
    assert "sub_type" in item
    assert "rank" in item
    assert "key" in item
    assert "labels" in item
    assert "label_ids" in item
    assert "assignee_agent_id" in item
    assert "assignee_name" in item
    assert "assignee_last_name" in item
    assert "assignee_initials" in item
    assert "assignee_avatar" in item


def test_active_sprint_empty_items(client):
    """Sprint with no items returns empty list."""
    _create_sprint(client, project_id="p2")

    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p2")
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["backlog"]["kind"] == "SPRINT"
    assert data["items"] == []


# ── Closed sprint ───────────────────────────────────────────────────────


def test_active_sprint_ignores_closed_sprint(client):
    """Only ACTIVE sprints are returned; closed ones are ignored."""
    sprint_id = _create_sprint(client, project_id="p2", status="CLOSED")
    assert sprint_id  # created and closed

    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p2")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


# ── Error cases ─────────────────────────────────────────────────────────


def test_active_sprint_no_sprint_exists(client):
    """Project p2 has no seeded sprint → 404."""
    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p2")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_active_sprint_missing_project_id(client):
    resp = client.get(ACTIVE_SPRINT_URL)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_active_sprint_nonexistent_project(client):
    """No sprint for unknown project → 404."""
    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=nonexistent")
    assert resp.status_code == 404


def test_active_sprint_reflects_item_label_mutation(client, _setup_test_db):
    with pg_connect(_setup_test_db) as conn:
        conn.execute(
            "INSERT INTO labels (id, project_id, name, color, created_at) "
            "VALUES (%s, %s, %s, %s, %s)",
            ["lbl-hotfix", "p1", "hotfix", "#ffaa00", TS],
        )
        conn.commit()

    _add_item(client, "b2", "s1")
    attach_resp = client.post("/v1/planning/work-items/s1/labels", json={"label_id": "lbl-hotfix"})
    assert attach_resp.status_code == 201

    first = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert first.status_code == 200
    item = first.json()["data"]["items"][0]
    assert item["labels"] == [{"id": "lbl-hotfix", "name": "hotfix", "color": "#ffaa00"}]
    assert item["label_ids"] == ["lbl-hotfix"]

    detach_resp = client.delete("/v1/planning/work-items/s1/labels/lbl-hotfix")
    assert detach_resp.status_code == 204

    second = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert second.status_code == 200
    item_after = second.json()["data"]["items"][0]
    assert item_after["labels"] == []
    assert item_after["label_ids"] == []


def test_active_sprint_shows_current_assignee(client, _setup_test_db):
    with pg_connect(_setup_test_db) as conn:
        conn.execute(
            "UPDATE work_items SET current_assignee_agent_id = %s WHERE id = %s",
            ["a1", "s1"],
        )
        conn.commit()

    _add_item(client, "b2", "s1")

    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert resp.status_code == 200
    item = resp.json()["data"]["items"][0]
    assert item["assignee_agent_id"] == "a1"


def test_active_sprint_assignee_null_when_unset(client):
    _add_item(client, "b2", "s1")

    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert resp.status_code == 200
    item = resp.json()["data"]["items"][0]
    assert item["assignee_agent_id"] is None
