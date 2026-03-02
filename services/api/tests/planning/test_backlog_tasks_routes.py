"""Integration tests for GET /v1/planning/backlogs/{backlog_id}/tasks."""

PREFIX = "/v1/planning/backlogs"


def _add_task(client, backlog_id: str, task_id: str, position: int):
    resp = client.post(
        f"{PREFIX}/{backlog_id}/tasks",
        json={"task_id": task_id, "position": position},
    )
    assert resp.status_code == 200


def test_backlog_tasks_happy_path_ordered_and_fields(client):
    _add_task(client, "b1", "t2", 0)
    _add_task(client, "b1", "t1", 0)

    resp = client.get(f"{PREFIX}/b1/tasks")
    assert resp.status_code == 200

    items = resp.json()["data"]
    assert [item["task_id"] for item in items] == ["t1", "t2"]
    assert [item["position"] for item in items] == [0, 1]

    first = items[0]
    for field in ["backlog_id", "task_id", "position", "added_at"]:
        assert field in first


def test_backlog_tasks_filters_out_story_linked_tasks(client):
    create_task_resp = client.post(
        "/v1/planning/tasks",
        json={
            "title": "Story-linked task",
            "task_type": "TASK",
            "project_id": "p1",
            "story_id": "s1",
        },
    )
    assert create_task_resp.status_code == 201
    linked_task_id = create_task_resp.json()["data"]["id"]

    add_resp = client.post(
        f"{PREFIX}/b1/tasks",
        json={"task_id": linked_task_id, "position": 0},
    )
    assert add_resp.status_code == 200

    resp = client.get(f"{PREFIX}/b1/tasks")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


def test_backlog_tasks_empty_list(client):
    resp = client.get(f"{PREFIX}/b1/tasks")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["meta"]["total"] == 0


def test_backlog_tasks_backlog_not_found(client):
    resp = client.get(f"{PREFIX}/does-not-exist/tasks")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"
