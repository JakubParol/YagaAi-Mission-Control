"""Integration tests for sprint membership management endpoints."""

PREFIX = "/v1/planning/backlogs"
MOVE_IN_URL = f"{PREFIX}/active-sprint/stories"


def _add_story_to_backlog(
    client, backlog_id: str, story_id: str, position: int | None = None
) -> None:
    payload: dict[str, str | int] = {"story_id": story_id}
    if position is not None:
        payload["position"] = position
    resp = client.post(f"{PREFIX}/{backlog_id}/stories", json=payload)
    assert resp.status_code == 200


def _list_story_ids(client, backlog_id: str) -> list[str]:
    resp = client.get(f"{PREFIX}/{backlog_id}/stories")
    assert resp.status_code == 200
    return [item["id"] for item in resp.json()["data"]]


def test_add_story_to_active_sprint_from_product_backlog(client) -> None:
    _add_story_to_backlog(client, "b1", "s1", position=0)

    resp = client.post(f"{MOVE_IN_URL}?project_id=p1", json={"story_id": "s1"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data == {
        "story_id": "s1",
        "project_id": "p1",
        "source_backlog_id": "b1",
        "target_backlog_id": "b2",
        "source_position": 0,
        "target_position": 0,
        "moved": True,
    }
    assert _list_story_ids(client, "b1") == []
    assert _list_story_ids(client, "b2") == ["s1"]


def test_add_story_to_active_sprint_idempotent_when_already_present(client) -> None:
    _add_story_to_backlog(client, "b2", "s1", position=0)

    resp = client.post(f"{MOVE_IN_URL}?project_id=p1", json={"story_id": "s1"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["moved"] is False
    assert data["source_backlog_id"] == "b2"
    assert data["target_backlog_id"] == "b2"
    assert data["source_position"] == 0
    assert data["target_position"] == 0
    assert _list_story_ids(client, "b2") == ["s1"]


def test_add_story_to_active_sprint_requires_product_backlog_membership(client) -> None:
    resp = client.post(f"{MOVE_IN_URL}?project_id=p1", json={"story_id": "s1"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_add_story_to_active_sprint_missing_project_selector(client) -> None:
    _add_story_to_backlog(client, "b1", "s1")

    resp = client.post(MOVE_IN_URL, json={"story_id": "s1"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_add_story_to_active_sprint_story_must_match_project(client) -> None:
    _add_story_to_backlog(client, "b1", "s1")

    resp = client.post(f"{MOVE_IN_URL}?project_id=p2", json={"story_id": "s1"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_add_story_to_active_sprint_no_active_sprint(client) -> None:
    resp = client.post(f"{MOVE_IN_URL}?project_id=p2", json={"story_id": "sp2"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_remove_story_from_active_sprint_to_product_backlog(client) -> None:
    _add_story_to_backlog(client, "b2", "s1", position=0)
    _add_story_to_backlog(client, "b1", "s2", position=0)

    resp = client.delete(f"{MOVE_IN_URL}/s1?project_id=p1&position=0")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data == {
        "story_id": "s1",
        "project_id": "p1",
        "source_backlog_id": "b2",
        "target_backlog_id": "b1",
        "source_position": 0,
        "target_position": 0,
        "moved": True,
    }
    assert _list_story_ids(client, "b2") == []
    assert _list_story_ids(client, "b1") == ["s1", "s2"]


def test_remove_story_from_active_sprint_idempotent_when_already_in_product_backlog(client) -> None:
    _add_story_to_backlog(client, "b1", "s1", position=0)

    resp = client.delete(f"{MOVE_IN_URL}/s1?project_id=p1")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["moved"] is False
    assert data["source_backlog_id"] == "b1"
    assert data["target_backlog_id"] == "b1"
    assert data["source_position"] == 0
    assert data["target_position"] == 0


def test_remove_story_from_active_sprint_requires_membership(client) -> None:
    resp = client.delete(f"{MOVE_IN_URL}/s1?project_id=p1")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_remove_story_from_active_sprint_missing_project_selector(client) -> None:
    _add_story_to_backlog(client, "b2", "s1")

    resp = client.delete(f"{MOVE_IN_URL}/s1")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
