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

from tests.support.postgres_compat import pg_connect

PREFIX = "/v1/planning/backlogs"
ACTIVE_SPRINT_URL = f"{PREFIX}/active-sprint"
TS = "2026-01-01T00:00:00Z"


# ── Setup helpers ───────────────────────────────────────────────────────


def _create_sprint(client, project_id="p2", name="Sprint 1", status="ACTIVE"):
    """Create a sprint backlog and return its id."""
    resp = client.post(
        PREFIX,
        json={"project_id": project_id, "name": name, "kind": "SPRINT"},
    )
    assert resp.status_code == 201
    backlog_id = resp.json()["data"]["id"]
    if status == "ACTIVE":
        start_resp = client.post(f"{PREFIX}/{backlog_id}/start?project_id={project_id}")
        assert start_resp.status_code == 200
    if status == "CLOSED":
        start_resp = client.post(f"{PREFIX}/{backlog_id}/start?project_id={project_id}")
        assert start_resp.status_code == 200
        complete_resp = client.post(f"{PREFIX}/{backlog_id}/complete?project_id={project_id}")
        assert complete_resp.status_code == 200
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
    assert "labels" in story
    assert "label_ids" in story
    assert "assignee_agent_id" in story
    assert "assignee_name" in story
    assert "assignee_last_name" in story
    assert "assignee_initials" in story
    assert "assignee_avatar" in story


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
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_active_sprint_nonexistent_project(client):
    """No sprint for unknown project → 404."""
    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=nonexistent")
    assert resp.status_code == 404


def test_active_sprint_reflects_story_label_mutation(client, _setup_test_db):
    with pg_connect(_setup_test_db) as conn:
        conn.execute(
            "INSERT INTO labels (id, project_id, name, color, created_at) "
            "VALUES (%s, %s, %s, %s, %s)",
            ["lbl-hotfix", "p1", "hotfix", "#ffaa00", TS],
        )
        conn.commit()

    _add_story(client, "b2", "s1", 0)
    attach_resp = client.post("/v1/planning/stories/s1/labels", json={"label_id": "lbl-hotfix"})
    assert attach_resp.status_code == 201

    first = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert first.status_code == 200
    story = first.json()["data"]["stories"][0]
    assert story["labels"] == [{"id": "lbl-hotfix", "name": "hotfix", "color": "#ffaa00"}]
    assert story["label_ids"] == ["lbl-hotfix"]

    detach_resp = client.delete("/v1/planning/stories/s1/labels/lbl-hotfix")
    assert detach_resp.status_code == 204

    second = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert second.status_code == 200
    story_after = second.json()["data"]["stories"][0]
    assert story_after["labels"] == []
    assert story_after["label_ids"] == []


def test_active_sprint_resolves_story_assignee_from_metadata(client, _setup_test_db):
    with pg_connect(_setup_test_db) as conn:
        conn.execute(
            """
            UPDATE stories
            SET metadata_json = %s
            WHERE id = %s
            """,
            [
                '{"quick_create_assignee_agent_id":"a1","quick_create_source":"board_todo_column"}',
                "s1",
            ],
        )
        conn.commit()

    _add_story(client, "b2", "s1", 0)

    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert resp.status_code == 200
    story = resp.json()["data"]["stories"][0]
    assert story["assignee_agent_id"] == "a1"
    assert story["assignee_name"] == "Agent"
    assert story["assignee_last_name"] == "Alpha"
    assert story["assignee_initials"] == "AA"
    assert story["assignee_avatar"] == "https://cdn.example.com/agent-1.png"


def test_active_sprint_keeps_assignee_id_when_agent_missing(client, _setup_test_db):
    with pg_connect(_setup_test_db) as conn:
        conn.execute(
            "UPDATE stories SET metadata_json = %s WHERE id = %s",
            ['{"quick_create_assignee_agent_id":"missing-agent"}', "s1"],
        )
        conn.commit()

    _add_story(client, "b2", "s1", 0)

    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_id=p1")
    assert resp.status_code == 200
    story = resp.json()["data"]["stories"][0]
    assert story["assignee_agent_id"] == "missing-agent"
    assert story["assignee_name"] is None
    assert story["assignee_last_name"] is None
    assert story["assignee_initials"] is None
    assert story["assignee_avatar"] is None
