"""Integration tests for sprint lifecycle transition endpoints."""

PREFIX = "/v1/planning/backlogs"


def _create_sprint(client, project_id: str, name: str = "Sprint X", status: str = "ACTIVE") -> str:
    create_resp = client.post(
        PREFIX,
        json={"project_id": project_id, "name": name, "kind": "SPRINT"},
    )
    assert create_resp.status_code == 201
    sprint_id = create_resp.json()["data"]["id"]
    if status != "ACTIVE":
        complete_resp = client.post(f"{PREFIX}/{sprint_id}/complete?project_id={project_id}")
        assert complete_resp.status_code == 200
    return sprint_id


def _add_story_to_backlog(client, backlog_id: str, story_id: str, position: int = 0) -> None:
    resp = client.post(
        f"{PREFIX}/{backlog_id}/stories",
        json={"story_id": story_id, "position": position},
    )
    assert resp.status_code == 200


def test_start_sprint_happy_path(client) -> None:
    sprint_id = _create_sprint(client, project_id="p2", status="CLOSED")

    resp = client.post(f"{PREFIX}/{sprint_id}/start?project_id=p2")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["status"] == "ACTIVE"
    assert body["meta"]["transition"] == "START_SPRINT"
    assert body["meta"]["from_status"] == "CLOSED"
    assert body["meta"]["to_status"] == "ACTIVE"
    assert body["meta"]["active_sprint_id"] == sprint_id


def test_start_sprint_rejects_non_sprint_backlog(client) -> None:
    resp = client.post(f"{PREFIX}/b1/start?project_id=p1")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_start_sprint_rejects_when_another_active_sprint_exists(client) -> None:
    sprint_id = _create_sprint(client, project_id="p1", name="Future sprint", status="CLOSED")

    resp = client.post(f"{PREFIX}/{sprint_id}/start?project_id=p1")
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CONFLICT"


def test_start_sprint_project_scope_validation(client) -> None:
    resp = client.post(f"{PREFIX}/b2/start?project_id=p2")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_start_sprint_by_project_key(client) -> None:
    sprint_id = _create_sprint(client, project_id="p2", status="CLOSED")

    resp = client.post(f"{PREFIX}/{sprint_id}/start?project_key=P2")
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "ACTIVE"


def test_complete_sprint_happy_path(client) -> None:
    _add_story_to_backlog(client, backlog_id="b2", story_id="s1")
    done_resp = client.patch("/v1/planning/stories/s1", json={"status": "DONE"})
    assert done_resp.status_code == 200

    resp = client.post(f"{PREFIX}/b2/complete?project_id=p1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["status"] == "CLOSED"
    assert body["meta"]["transition"] == "COMPLETE_SPRINT"
    assert body["meta"]["from_status"] == "ACTIVE"
    assert body["meta"]["to_status"] == "CLOSED"
    assert body["meta"]["story_count"] == 1
    assert body["meta"]["done_story_count"] == 1
    assert body["meta"]["unfinished_story_count"] == 0
    assert body["meta"]["active_sprint_id"] is None


def test_complete_sprint_rejects_unfinished_stories(client) -> None:
    _add_story_to_backlog(client, backlog_id="b2", story_id="s1")

    resp = client.post(f"{PREFIX}/b2/complete?project_id=p1")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"
    assert "unfinished stories" in resp.json()["error"]["message"]


def test_complete_sprint_rejects_not_active(client) -> None:
    sprint_id = _create_sprint(client, project_id="p2", status="CLOSED")

    resp = client.post(f"{PREFIX}/{sprint_id}/complete?project_id=p2")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_complete_sprint_rejects_non_sprint_backlog(client) -> None:
    resp = client.post(f"{PREFIX}/b1/complete?project_id=p1")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_complete_sprint_project_scope_validation(client) -> None:
    _add_story_to_backlog(client, backlog_id="b2", story_id="s1")
    client.patch("/v1/planning/stories/s1", json={"status": "DONE"})

    resp = client.post(f"{PREFIX}/b2/complete?project_id=p2")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
