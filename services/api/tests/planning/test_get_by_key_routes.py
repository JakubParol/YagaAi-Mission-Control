"""
Integration tests for GET /by-key/{key} endpoints.

Covers:
- GET /v1/planning/stories/by-key/{key} — fetch story by human-readable key
- GET /v1/planning/tasks/by-key/{key} — fetch task by human-readable key
- GET /v1/planning/epics/by-key/{key} — fetch epic by human-readable key
- GET /v1/planning/backlogs/active-sprint?project_key=... — active sprint by project key

Each entity must first be created via POST (to generate keys), then fetched by key.
"""

STORIES_URL = "/v1/planning/stories"
TASKS_URL = "/v1/planning/tasks"
EPICS_URL = "/v1/planning/epics"
ACTIVE_SPRINT_URL = "/v1/planning/backlogs/active-sprint"


# ── Helpers ────────────────────────────────────────────────────────────


def _create_story(client, project_id="p1", title="Test Story"):
    resp = client.post(
        STORIES_URL,
        json={"title": title, "story_type": "USER_STORY", "project_id": project_id},
    )
    assert resp.status_code == 201
    return resp.json()["data"]


def _create_task(client, project_id="p1", title="Test Task"):
    resp = client.post(
        TASKS_URL,
        json={"title": title, "task_type": "TASK", "project_id": project_id},
    )
    assert resp.status_code == 201
    return resp.json()["data"]


def _create_epic(client, project_id="p1", title="Test Epic"):
    resp = client.post(
        EPICS_URL,
        json={"title": title, "project_id": project_id},
    )
    assert resp.status_code == 201
    return resp.json()["data"]


# ── Stories by key ─────────────────────────────────────────────────────


def test_get_story_by_key(client) -> None:
    story = _create_story(client)
    key = story["key"]

    resp = client.get(f"{STORIES_URL}/by-key/{key}")
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["id"] == story["id"]
    assert data["key"] == key
    assert data["title"] == "Test Story"
    assert "task_count" in data


def test_get_story_by_key_case_insensitive(client) -> None:
    story = _create_story(client)
    key = story["key"].lower()

    resp = client.get(f"{STORIES_URL}/by-key/{key}")
    assert resp.status_code == 200
    assert resp.json()["data"]["id"] == story["id"]


def test_get_story_by_key_not_found(client) -> None:
    resp = client.get(f"{STORIES_URL}/by-key/NONEXISTENT-999")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_get_story_by_key_includes_task_count(client) -> None:
    story = _create_story(client)
    client.post(
        TASKS_URL,
        json={
            "title": "Child Task",
            "task_type": "TASK",
            "project_id": "p1",
            "story_id": story["id"],
        },
    )

    resp = client.get(f"{STORIES_URL}/by-key/{story['key']}")
    assert resp.status_code == 200
    assert resp.json()["data"]["task_count"] == 1


# ── Tasks by key ───────────────────────────────────────────────────────


def test_get_task_by_key(client) -> None:
    task = _create_task(client)
    key = task["key"]

    resp = client.get(f"{TASKS_URL}/by-key/{key}")
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["id"] == task["id"]
    assert data["key"] == key
    assert data["title"] == "Test Task"
    assert "assignments" in data


def test_get_task_by_key_case_insensitive(client) -> None:
    task = _create_task(client)
    key = task["key"].lower()

    resp = client.get(f"{TASKS_URL}/by-key/{key}")
    assert resp.status_code == 200
    assert resp.json()["data"]["id"] == task["id"]


def test_get_task_by_key_not_found(client) -> None:
    resp = client.get(f"{TASKS_URL}/by-key/NONEXISTENT-999")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


# ── Epics by key ───────────────────────────────────────────────────────


def test_get_epic_by_key(client) -> None:
    epic = _create_epic(client)
    key = epic["key"]

    resp = client.get(f"{EPICS_URL}/by-key/{key}")
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["id"] == epic["id"]
    assert data["key"] == key
    assert data["title"] == "Test Epic"
    assert "story_count" in data


def test_get_epic_by_key_case_insensitive(client) -> None:
    epic = _create_epic(client)
    key = epic["key"].lower()

    resp = client.get(f"{EPICS_URL}/by-key/{key}")
    assert resp.status_code == 200
    assert resp.json()["data"]["id"] == epic["id"]


def test_get_epic_by_key_not_found(client) -> None:
    resp = client.get(f"{EPICS_URL}/by-key/NONEXISTENT-999")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_get_epic_by_key_includes_story_count(client) -> None:
    epic = _create_epic(client)
    _create_story(client, title="Epic Child Story")

    resp = client.get(f"{EPICS_URL}/by-key/{epic['key']}")
    assert resp.status_code == 200
    assert resp.json()["data"]["story_count"] == 0  # story not linked to epic


# ── Active sprint by project_key ───────────────────────────────────────


def test_active_sprint_by_project_key(client) -> None:
    """Seeded b2 is an active sprint for project P1."""
    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_key=P1")
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["backlog"]["id"] == "b2"
    assert data["backlog"]["kind"] == "SPRINT"


def test_active_sprint_by_project_key_case_insensitive(client) -> None:
    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_key=p1")
    assert resp.status_code == 200
    assert resp.json()["data"]["backlog"]["id"] == "b2"


def test_active_sprint_project_key_not_found(client) -> None:
    resp = client.get(f"{ACTIVE_SPRINT_URL}?project_key=NONEXISTENT")
    assert resp.status_code == 404


def test_active_sprint_missing_both_params(client) -> None:
    resp = client.get(ACTIVE_SPRINT_URL)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
