"""
Integration tests for the tasks CRUD API.

Coverage:
- POST /v1/planning/tasks — create with/without project, with story, key generation
- GET /v1/planning/tasks — list with project/story/status/assignee filters, pagination, sorting
- GET /v1/planning/tasks/{id} — single task with assignment history
- PATCH /v1/planning/tasks/{id} — update fields, status lifecycle (started_at, completed_at),
  is_blocked flag, DONE auto-closes assignment
- DELETE /v1/planning/tasks/{id} — hard delete
- POST /v1/planning/tasks/{id}/assignments — assign agent (replace, conflict, validation)
- DELETE /v1/planning/tasks/{id}/assignments/{agent_id} — unassign agent
- POST /v1/planning/tasks/{id}/labels — attach/detach labels
- Parent story status re-derivation on task create/update/delete
- Story started_at set on first IN_PROGRESS task

Fixtures:
- client — FastAPI TestClient (from conftest)
- _setup_test_db — in-memory SQLite with schema + seed data (from conftest)
"""

import sqlite3

TS = "2026-01-01T00:00:00Z"


# ── Create ────────────────────────────────────────────────────────────────


def test_create_task_with_project(client) -> None:
    resp = client.post(
        "/v1/planning/tasks",
        json={"title": "Implement auth", "task_type": "TASK", "project_id": "p1"},
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["project_id"] == "p1"
    assert data["key"] == "P1-1"
    assert data["title"] == "Implement auth"
    assert data["task_type"] == "TASK"
    assert data["status"] == "TODO"
    assert data["is_blocked"] is False
    assert "id" in data
    assert "created_at" in data


def test_create_task_without_project(client) -> None:
    resp = client.post(
        "/v1/planning/tasks",
        json={"title": "Global task", "task_type": "SPIKE"},
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["project_id"] is None
    assert data["key"] is None


def test_create_task_with_story(client) -> None:
    resp = client.post(
        "/v1/planning/tasks",
        json={
            "title": "Child Task",
            "task_type": "TASK",
            "project_id": "p1",
            "story_id": "s1",
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["story_id"] == "s1"
    assert data["key"] == "P1-1"


def test_create_task_with_all_fields(client) -> None:
    resp = client.post(
        "/v1/planning/tasks",
        json={
            "title": "Full Task",
            "task_type": "TASK",
            "project_id": "p1",
            "objective": "Test objective",
            "priority": 5,
            "estimate_points": 3.0,
            "due_at": "2026-03-01T00:00:00Z",
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["objective"] == "Test objective"
    assert data["priority"] == 5
    assert data["estimate_points"] == 3.0
    assert data["due_at"] == "2026-03-01T00:00:00Z"


def test_create_task_increments_counter(client) -> None:
    resp1 = client.post(
        "/v1/planning/tasks",
        json={"title": "T1", "task_type": "TASK", "project_id": "p1"},
    )
    resp2 = client.post(
        "/v1/planning/tasks",
        json={"title": "T2", "task_type": "TASK", "project_id": "p1"},
    )
    assert resp1.json()["data"]["key"] == "P1-1"
    assert resp2.json()["data"]["key"] == "P1-2"


def test_create_task_nonexistent_project(client) -> None:
    resp = client.post(
        "/v1/planning/tasks",
        json={"title": "Bad", "task_type": "TASK", "project_id": "nope"},
    )
    assert resp.status_code == 400


def test_create_task_nonexistent_story(client) -> None:
    resp = client.post(
        "/v1/planning/tasks",
        json={"title": "Bad", "task_type": "TASK", "project_id": "p1", "story_id": "nope"},
    )
    assert resp.status_code == 400


def test_create_task_empty_title(client) -> None:
    resp = client.post(
        "/v1/planning/tasks",
        json={"title": "", "task_type": "TASK"},
    )
    assert resp.status_code == 422


# ── List ──────────────────────────────────────────────────────────────────


def test_list_tasks_with_data(client) -> None:
    client.post(
        "/v1/planning/tasks",
        json={"title": "T1", "task_type": "TASK", "project_id": "p1"},
    )
    client.post(
        "/v1/planning/tasks",
        json={"title": "T2", "task_type": "TASK", "project_id": "p1"},
    )

    resp = client.get("/v1/planning/tasks", params={"project_id": "p1"})
    assert resp.status_code == 200
    # p1 had 2 seeded + 2 new = 4
    assert resp.json()["meta"]["total"] == 4


def test_list_tasks_filter_by_story(client) -> None:
    client.post(
        "/v1/planning/tasks",
        json={"title": "T1", "task_type": "TASK", "project_id": "p1", "story_id": "s1"},
    )
    client.post(
        "/v1/planning/tasks",
        json={"title": "T2", "task_type": "TASK", "project_id": "p1"},
    )

    resp = client.get("/v1/planning/tasks", params={"story_id": "s1"})
    assert resp.json()["meta"]["total"] == 1


def test_list_tasks_filter_by_status(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T1", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]
    client.patch(f"/v1/planning/tasks/{task_id}", json={"status": "IN_PROGRESS"})

    resp = client.get("/v1/planning/tasks", params={"status": "IN_PROGRESS"})
    assert resp.json()["meta"]["total"] == 1


def test_list_tasks_filter_by_assignee(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T1", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]
    client.post(f"/v1/planning/tasks/{task_id}/assignments", json={"agent_id": "a1"})

    resp = client.get("/v1/planning/tasks", params={"assignee_id": "a1"})
    assert resp.json()["meta"]["total"] == 1


def test_list_tasks_pagination(client) -> None:
    for i in range(5):
        client.post(
            "/v1/planning/tasks",
            json={"title": f"T{i}", "task_type": "TASK", "project_id": "p1"},
        )

    resp = client.get(
        "/v1/planning/tasks",
        params={"project_id": "p1", "limit": 2, "offset": 0},
    )
    body = resp.json()
    assert len(body["data"]) == 2
    # 2 seeded + 5 new = 7
    assert body["meta"]["total"] == 7


def test_list_tasks_sort(client) -> None:
    client.post(
        "/v1/planning/tasks",
        json={"title": "Bravo", "task_type": "TASK", "project_id": "p2"},
    )
    client.post(
        "/v1/planning/tasks",
        json={"title": "Alpha", "task_type": "TASK", "project_id": "p2"},
    )

    resp = client.get("/v1/planning/tasks", params={"project_id": "p2", "sort": "title"})
    data = resp.json()["data"]
    titles = [d["title"] for d in data]
    assert titles == sorted(titles)


def test_list_tasks_sort_invalid(client) -> None:
    resp = client.get("/v1/planning/tasks", params={"sort": "nonexistent"})
    assert resp.status_code == 400
    assert "Invalid sort field" in resp.json()["error"]["message"]


# ── Get single ────────────────────────────────────────────────────────────


def test_get_task(client) -> None:
    create_resp = client.post(
        "/v1/planning/tasks",
        json={"title": "My Task", "task_type": "TASK", "project_id": "p1"},
    )
    task_id = create_resp.json()["data"]["id"]

    resp = client.get(f"/v1/planning/tasks/{task_id}")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["id"] == task_id
    assert data["title"] == "My Task"
    assert data["assignments"] == []


def test_get_task_not_found(client) -> None:
    resp = client.get("/v1/planning/tasks/nonexistent")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_get_task_includes_assignments(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "Assigned Task", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    client.post(f"/v1/planning/tasks/{task_id}/assignments", json={"agent_id": "a1"})

    resp = client.get(f"/v1/planning/tasks/{task_id}")
    data = resp.json()["data"]
    assert len(data["assignments"]) == 1
    assert data["assignments"][0]["agent_id"] == "a1"


# ── Update ────────────────────────────────────────────────────────────────


def test_update_task_title(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "Old Title", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    resp = client.patch(f"/v1/planning/tasks/{task_id}", json={"title": "New Title"})
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] == "New Title"


def test_update_task_status_done_sets_completed_at(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]
    assert client.get(f"/v1/planning/tasks/{task_id}").json()["data"]["completed_at"] is None

    resp = client.patch(f"/v1/planning/tasks/{task_id}", json={"status": "DONE"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["status"] == "DONE"
    assert data["completed_at"] is not None


def test_update_task_status_away_from_done_clears_completed_at(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    client.patch(f"/v1/planning/tasks/{task_id}", json={"status": "DONE"})
    resp = client.patch(f"/v1/planning/tasks/{task_id}", json={"status": "TODO"})
    assert resp.status_code == 200
    assert resp.json()["data"]["completed_at"] is None


def test_update_task_status_in_progress_sets_started_at(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    resp = client.patch(f"/v1/planning/tasks/{task_id}", json={"status": "IN_PROGRESS"})
    assert resp.status_code == 200
    assert resp.json()["data"]["started_at"] is not None


def test_update_task_not_found(client) -> None:
    resp = client.patch("/v1/planning/tasks/nope", json={"title": "X"})
    assert resp.status_code == 404


def test_update_task_invalid_status(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    resp = client.patch(f"/v1/planning/tasks/{task_id}", json={"status": "INVALID"})
    assert resp.status_code == 422


# ── Delete ────────────────────────────────────────────────────────────────


def test_delete_task(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "Doomed", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    resp = client.delete(f"/v1/planning/tasks/{task_id}")
    assert resp.status_code == 204

    get_resp = client.get(f"/v1/planning/tasks/{task_id}")
    assert get_resp.status_code == 404


def test_delete_task_not_found(client) -> None:
    resp = client.delete("/v1/planning/tasks/nonexistent")
    assert resp.status_code == 404


# ── Status side effects: DONE auto-closes assignment ─────────────────────


def test_done_auto_closes_active_assignment(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    client.post(f"/v1/planning/tasks/{task_id}/assignments", json={"agent_id": "a1"})
    client.patch(f"/v1/planning/tasks/{task_id}", json={"status": "DONE"})

    resp = client.get(f"/v1/planning/tasks/{task_id}")
    data = resp.json()["data"]
    assert data["status"] == "DONE"
    assert data["completed_at"] is not None
    assert len(data["assignments"]) == 1
    assert data["assignments"][0]["unassigned_at"] is not None


# ── Assignments ───────────────────────────────────────────────────────────


def test_assign_agent(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    resp = client.post(f"/v1/planning/tasks/{task_id}/assignments", json={"agent_id": "a1"})
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["agent_id"] == "a1"
    assert data["task_id"] == task_id
    assert data["unassigned_at"] is None

    # Verify current_assignee_agent_id updated
    task_resp = client.get(f"/v1/planning/tasks/{task_id}")
    assert task_resp.json()["data"]["current_assignee_agent_id"] == "a1"


def test_assign_agent_replaces_previous(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    client.post(f"/v1/planning/tasks/{task_id}/assignments", json={"agent_id": "a1"})
    resp = client.post(f"/v1/planning/tasks/{task_id}/assignments", json={"agent_id": "a2"})
    assert resp.status_code == 201

    # Check assignment history
    task_resp = client.get(f"/v1/planning/tasks/{task_id}")
    data = task_resp.json()["data"]
    assert data["current_assignee_agent_id"] == "a2"
    assert len(data["assignments"]) == 2
    # First assignment should be closed
    closed = [a for a in data["assignments"] if a["agent_id"] == "a1"]
    assert len(closed) == 1
    assert closed[0]["unassigned_at"] is not None


def test_assign_same_agent_twice_conflict(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    client.post(f"/v1/planning/tasks/{task_id}/assignments", json={"agent_id": "a1"})
    resp = client.post(f"/v1/planning/tasks/{task_id}/assignments", json={"agent_id": "a1"})
    assert resp.status_code == 409


def test_assign_nonexistent_agent(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    resp = client.post(f"/v1/planning/tasks/{task_id}/assignments", json={"agent_id": "nope"})
    assert resp.status_code == 400


def test_assign_nonexistent_task(client) -> None:
    resp = client.post("/v1/planning/tasks/nope/assignments", json={"agent_id": "a1"})
    assert resp.status_code == 404


def test_unassign_agent(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    client.post(f"/v1/planning/tasks/{task_id}/assignments", json={"agent_id": "a1"})
    resp = client.delete(f"/v1/planning/tasks/{task_id}/assignments/a1")
    assert resp.status_code == 204

    task_resp = client.get(f"/v1/planning/tasks/{task_id}")
    assert task_resp.json()["data"]["current_assignee_agent_id"] is None


def test_unassign_agent_not_assigned(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    resp = client.delete(f"/v1/planning/tasks/{task_id}/assignments/a1")
    assert resp.status_code == 404


# ── Labels ────────────────────────────────────────────────────────────────


def test_attach_label(client, _setup_test_db) -> None:
    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO labels (id, project_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
        ("lbl-t1", "p1", "bug", "red", TS),
    )
    conn.commit()
    conn.close()

    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "Labeled Task", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    resp = client.post(
        f"/v1/planning/tasks/{task_id}/labels",
        json={"label_id": "lbl-t1"},
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["task_id"] == task_id
    assert data["label_id"] == "lbl-t1"


def test_attach_label_duplicate(client, _setup_test_db) -> None:
    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO labels (id, project_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
        ("lbl-tdup", "p1", "feature", "blue", TS),
    )
    conn.commit()
    conn.close()

    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "Dup Label", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    client.post(f"/v1/planning/tasks/{task_id}/labels", json={"label_id": "lbl-tdup"})
    resp = client.post(f"/v1/planning/tasks/{task_id}/labels", json={"label_id": "lbl-tdup"})
    assert resp.status_code == 409


def test_attach_label_task_not_found(client, _setup_test_db) -> None:
    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO labels (id, project_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
        ("lbl-tnf", "p1", "nf", "green", TS),
    )
    conn.commit()
    conn.close()

    resp = client.post("/v1/planning/tasks/nope/labels", json={"label_id": "lbl-tnf"})
    assert resp.status_code == 404


def test_attach_label_nonexistent(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    resp = client.post(f"/v1/planning/tasks/{task_id}/labels", json={"label_id": "nope"})
    assert resp.status_code == 400


def test_detach_label(client, _setup_test_db) -> None:
    db_path = _setup_test_db
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO labels (id, project_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
        ("lbl-tdet", "p1", "detach", "yellow", TS),
    )
    conn.commit()
    conn.close()

    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "Detach Task", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    client.post(f"/v1/planning/tasks/{task_id}/labels", json={"label_id": "lbl-tdet"})
    resp = client.delete(f"/v1/planning/tasks/{task_id}/labels/lbl-tdet")
    assert resp.status_code == 204


def test_detach_label_not_attached(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    resp = client.delete(f"/v1/planning/tasks/{task_id}/labels/nonexistent")
    assert resp.status_code == 404


def test_detach_label_task_not_found(client) -> None:
    resp = client.delete("/v1/planning/tasks/nope/labels/any-label")
    assert resp.status_code == 404


# ── Parent story status re-derivation ─────────────────────────────────────


def test_task_done_rederives_parent_story_status(client) -> None:
    # Create a story and two tasks under it
    story_id = client.post(
        "/v1/planning/stories",
        json={"title": "Parent Story", "story_type": "USER_STORY", "project_id": "p1"},
    ).json()["data"]["id"]

    t1_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T1", "task_type": "TASK", "project_id": "p1", "story_id": story_id},
    ).json()["data"]["id"]

    t2_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T2", "task_type": "TASK", "project_id": "p1", "story_id": story_id},
    ).json()["data"]["id"]

    # Move T1 to DONE — story should become IN_PROGRESS (mixed)
    client.patch(f"/v1/planning/tasks/{t1_id}", json={"status": "DONE"})
    story = client.get(f"/v1/planning/stories/{story_id}").json()["data"]
    assert story["status"] == "IN_PROGRESS"
    assert story["status_mode"] == "DERIVED"

    # Move T2 to DONE — all tasks done, story should become DONE
    client.patch(f"/v1/planning/tasks/{t2_id}", json={"status": "DONE"})
    story = client.get(f"/v1/planning/stories/{story_id}").json()["data"]
    assert story["status"] == "DONE"
    assert story["status_mode"] == "DERIVED"
    assert story["completed_at"] is not None


def test_task_creation_rederives_parent_story_status(client) -> None:
    # Create story, manually set to DONE
    story_id = client.post(
        "/v1/planning/stories",
        json={"title": "Parent Story", "story_type": "USER_STORY", "project_id": "p1"},
    ).json()["data"]["id"]
    client.patch(f"/v1/planning/stories/{story_id}", json={"status": "DONE"})

    # Create a TODO task under it — should rederive story to TODO
    client.post(
        "/v1/planning/tasks",
        json={"title": "New Task", "task_type": "TASK", "project_id": "p1", "story_id": story_id},
    )

    story = client.get(f"/v1/planning/stories/{story_id}").json()["data"]
    assert story["status"] == "TODO"
    assert story["status_mode"] == "DERIVED"


def test_task_deletion_rederives_parent_story_status(client) -> None:
    # Create story with two tasks, complete one
    story_id = client.post(
        "/v1/planning/stories",
        json={"title": "Parent Story", "story_type": "USER_STORY", "project_id": "p1"},
    ).json()["data"]["id"]

    t1_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T1", "task_type": "TASK", "project_id": "p1", "story_id": story_id},
    ).json()["data"]["id"]

    t2_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T2", "task_type": "TASK", "project_id": "p1", "story_id": story_id},
    ).json()["data"]["id"]

    client.patch(f"/v1/planning/tasks/{t1_id}", json={"status": "DONE"})
    # Story is IN_PROGRESS (mixed)

    # Delete the TODO task — only DONE task remains, story should become DONE
    client.delete(f"/v1/planning/tasks/{t2_id}")
    story = client.get(f"/v1/planning/stories/{story_id}").json()["data"]
    assert story["status"] == "DONE"


# ── is_blocked update ─────────────────────────────────────────────────────


def test_update_task_is_blocked(client) -> None:
    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "Blockable", "task_type": "TASK", "project_id": "p1"},
    ).json()["data"]["id"]

    resp = client.patch(f"/v1/planning/tasks/{task_id}", json={"is_blocked": True})
    assert resp.status_code == 200
    assert resp.json()["data"]["is_blocked"] is True

    resp = client.patch(f"/v1/planning/tasks/{task_id}", json={"is_blocked": False})
    assert resp.status_code == 200
    assert resp.json()["data"]["is_blocked"] is False


# ── Story started_at on first IN_PROGRESS task ────────────────────────────


def test_first_task_in_progress_sets_story_started_at(client) -> None:
    story_id = client.post(
        "/v1/planning/stories",
        json={"title": "Track Start", "story_type": "USER_STORY", "project_id": "p1"},
    ).json()["data"]["id"]

    # Story starts with no started_at
    story = client.get(f"/v1/planning/stories/{story_id}").json()["data"]
    assert story["started_at"] is None

    task_id = client.post(
        "/v1/planning/tasks",
        json={"title": "T1", "task_type": "TASK", "project_id": "p1", "story_id": story_id},
    ).json()["data"]["id"]

    # Move task to IN_PROGRESS — story should get started_at
    client.patch(f"/v1/planning/tasks/{task_id}", json={"status": "IN_PROGRESS"})
    story = client.get(f"/v1/planning/stories/{story_id}").json()["data"]
    assert story["status"] == "IN_PROGRESS"
    assert story["started_at"] is not None


# ── Key filter ────────────────────────────────────────────────────────────


def test_list_tasks_filter_by_key(client):
    # Create a task with a project to get an auto-generated key
    resp = client.post(
        "/v1/planning/tasks",
        json={"title": "Keyed task", "task_type": "TASK", "project_id": "p1"},
    )
    assert resp.status_code == 201
    key = resp.json()["data"]["key"]
    assert key is not None

    resp = client.get(f"/v1/planning/tasks?key={key}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 1
    assert body["data"][0]["key"] == key


def test_list_tasks_filter_by_key_no_match(client):
    resp = client.get("/v1/planning/tasks?key=NONEXISTENT-999")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 0
    assert body["data"] == []


# ── project_key resolver ─────────────────────────────────────────────────


def test_list_tasks_by_project_key(client):
    resp = client.get("/v1/planning/tasks?project_key=P1")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) > 0
    assert all(t["project_id"] == "p1" for t in data)


def test_list_tasks_project_key_not_found(client):
    resp = client.get("/v1/planning/tasks?project_key=NOPE")
    assert resp.status_code == 404


def test_list_tasks_project_key_overrides_project_id(client):
    resp = client.get("/v1/planning/tasks?project_key=P1&project_id=p2")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert all(t["project_id"] == "p1" for t in data)
