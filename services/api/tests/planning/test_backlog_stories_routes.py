"""Integration tests for GET /v1/planning/backlogs/{backlog_id}/stories."""

import sqlite3

PREFIX = "/v1/planning/backlogs"
TS = "2026-01-01T00:00:00Z"


def _add_story(client, backlog_id: str, story_id: str, position: int):
    resp = client.post(
        f"{PREFIX}/{backlog_id}/stories",
        json={"story_id": story_id, "position": position},
    )
    assert resp.status_code == 200


def test_backlog_stories_happy_path_ordered_and_fields(client):
    _add_story(client, "b1", "s2", 0)
    _add_story(client, "b1", "s1", 0)

    resp = client.get(f"{PREFIX}/b1/stories")
    assert resp.status_code == 200

    stories = resp.json()["data"]
    assert [s["id"] for s in stories] == ["s1", "s2"]
    assert [s["position"] for s in stories] == [0, 1]

    first = stories[0]
    for field in [
        "id",
        "key",
        "title",
        "status",
        "priority",
        "story_type",
        "position",
        "task_count",
        "done_task_count",
    ]:
        assert field in first


def test_backlog_stories_empty_list(client):
    resp = client.get(f"{PREFIX}/b1/stories")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


def test_backlog_stories_backlog_not_found(client):
    resp = client.get(f"{PREFIX}/does-not-exist/stories")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_backlog_stories_includes_label_payload(client, _setup_test_db):
    conn = sqlite3.connect(_setup_test_db)
    conn.execute(
        "INSERT INTO labels (id, project_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
        ("lbl-story", "p1", "urgent", "#ff0000", TS),
    )
    conn.commit()
    conn.close()

    attach_resp = client.post("/v1/planning/stories/s1/labels", json={"label_id": "lbl-story"})
    assert attach_resp.status_code == 201
    _add_story(client, "b1", "s1", 0)

    resp = client.get(f"{PREFIX}/b1/stories")
    assert resp.status_code == 200
    story = resp.json()["data"][0]
    assert story["id"] == "s1"
    assert story["labels"] == [{"id": "lbl-story", "name": "urgent", "color": "#ff0000"}]
    assert story["label_ids"] == ["lbl-story"]
