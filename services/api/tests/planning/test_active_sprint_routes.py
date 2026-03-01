"""
Integration tests for the active sprint board endpoint.

Covers: GET /v1/planning/backlogs/active-sprint?project_id=...
- Returns active sprint with stories ordered by position
- Returns 404 when no active sprint exists
- Returns 422 when project_id is missing
- Returns empty stories list for sprint with no stories

Note: Seed data (conftest) includes b2 = SPRINT/ACTIVE for project p1.
Tests that need a clean slate for sprints use project p2 (no seeded sprint).
"""

PREFIX = "/v1/planning/backlogs"
ACTIVE_SPRINT_URL = f"{PREFIX}/active-sprint"


# ── Setup helpers ───────────────────────────────────────────────────────


def _create_sprint(client, project_id="p2", name="Sprint 1", status="ACTIVE"):
    """Create a sprint backlog and return its id."""
    resp = client.post(
        PREFIX,
        json={"project_id": project_id, "name": name, "kind": "SPRINT"},
    )
    assert resp.status_code == 201
    backlog_id = resp.json()["data"]["id"]
    if status != "ACTIVE":
        client.patch(f"{PREFIX}/{backlog_id}", json={"status": status})
    return backlog_id


def _add_story(client, backlog_id, story_id, position):
    resp = client.post(
        f"{PREFIX}/{backlog_id}/stories",
        json={"story_id": story_id, "position": position},
    )
    assert resp.status_code == 200
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
    assert data["stories"] == []


def test_active_sprint_with_stories(client):
    """Add stories to seeded sprint b2 and verify they appear."""
    _add_story(client, "b2", "s1", 0)
    _add_story(client, "b2", "s2", 1)

    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert resp.status_code == 200

    stories = resp.json()["data"]["stories"]
    assert len(stories) == 2
    assert stories[0]["id"] == "s1"
    assert stories[0]["position"] == 0
    assert stories[1]["id"] == "s2"
    assert stories[1]["position"] == 1


def test_active_sprint_story_fields(client):
    """Verify all expected fields are present on sprint stories."""
    _add_story(client, "b2", "s1", 0)

    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert resp.status_code == 200

    story = resp.json()["data"]["stories"][0]
    assert story["id"] == "s1"
    assert "title" in story
    assert "status" in story
    assert "priority" in story
    assert "story_type" in story
    assert "position" in story
    assert "key" in story


def test_active_sprint_empty_stories(client):
    """Sprint with no stories returns empty list."""
    _create_sprint(client, project_id="p2")

    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p2")
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["backlog"]["kind"] == "SPRINT"
    assert data["stories"] == []


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
    assert resp.status_code == 422


def test_active_sprint_nonexistent_project(client):
    """No sprint for unknown project → 404."""
    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=nonexistent")
    assert resp.status_code == 404
