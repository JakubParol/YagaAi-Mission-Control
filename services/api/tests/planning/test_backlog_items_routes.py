# ── Add story ────────────────────────────────────────────────────────────


def test_add_story_to_backlog(client) -> None:
    resp = client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s1", "position": 0})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["backlog_id"] == "b1"
    assert data["story_id"] == "s1"
    assert data["position"] == 0
    assert "added_at" in data


def test_add_story_position_normalized(client) -> None:
    """Position beyond current count is clamped to append."""
    resp = client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s1", "position": 999})
    assert resp.status_code == 200
    assert resp.json()["data"]["position"] == 0  # first item → clamped to 0


def test_add_story_insert_at_front_shifts_others(client) -> None:
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s1", "position": 0})
    resp = client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s2", "position": 0})
    assert resp.status_code == 200
    assert resp.json()["data"]["position"] == 0


def test_add_story_nonexistent_backlog(client) -> None:
    resp = client.post("/v1/planning/backlogs/nope/stories", json={"story_id": "s1", "position": 0})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_add_nonexistent_story(client) -> None:
    resp = client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "nope", "position": 0})
    assert resp.status_code == 404


def test_add_story_conflict_already_in_backlog(client) -> None:
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s1", "position": 0})
    resp = client.post("/v1/planning/backlogs/b2/stories", json={"story_id": "s1", "position": 0})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CONFLICT"


def test_global_backlog_rejects_project_story(client) -> None:
    resp = client.post("/v1/planning/backlogs/bg/stories", json={"story_id": "s1", "position": 0})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_global_backlog_accepts_global_story(client) -> None:
    resp = client.post("/v1/planning/backlogs/bg/stories", json={"story_id": "sg", "position": 0})
    assert resp.status_code == 200
    assert resp.json()["data"]["story_id"] == "sg"


def test_project_backlog_rejects_other_project_story(client) -> None:
    resp = client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "sp2", "position": 0})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


# ── Remove story ─────────────────────────────────────────────────────────


def test_remove_story_from_backlog(client) -> None:
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s1", "position": 0})
    resp = client.delete("/v1/planning/backlogs/b1/stories/s1")
    assert resp.status_code == 204

    resp_again = client.delete("/v1/planning/backlogs/b1/stories/s1")
    assert resp_again.status_code == 404


def test_remove_story_shifts_positions(client) -> None:
    """After removing position 0, remaining items shift down."""
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s1", "position": 0})
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s2", "position": 1})
    client.delete("/v1/planning/backlogs/b1/stories/s1")

    # s2 should now be at position 0 — verify via reorder with position 0
    reorder = client.patch(
        "/v1/planning/backlogs/b1/reorder",
        json={"stories": [{"story_id": "s2", "position": 0}], "tasks": []},
    )
    assert reorder.status_code == 200


# ── Add task ─────────────────────────────────────────────────────────────


def test_add_task_to_backlog(client) -> None:
    resp = client.post("/v1/planning/backlogs/b1/tasks", json={"task_id": "t1", "position": 0})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["backlog_id"] == "b1"
    assert data["task_id"] == "t1"
    assert data["position"] == 0
    assert "added_at" in data


def test_add_task_nonexistent_backlog(client) -> None:
    resp = client.post("/v1/planning/backlogs/nope/tasks", json={"task_id": "t1", "position": 0})
    assert resp.status_code == 404


def test_add_nonexistent_task(client) -> None:
    resp = client.post("/v1/planning/backlogs/b1/tasks", json={"task_id": "nope", "position": 0})
    assert resp.status_code == 404


def test_add_task_conflict_already_in_backlog(client) -> None:
    client.post("/v1/planning/backlogs/b1/tasks", json={"task_id": "t1", "position": 0})
    resp = client.post("/v1/planning/backlogs/b2/tasks", json={"task_id": "t1", "position": 0})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CONFLICT"


def test_project_backlog_rejects_other_project_task(client) -> None:
    resp = client.post("/v1/planning/backlogs/b1/tasks", json={"task_id": "tp2", "position": 0})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_global_backlog_rejects_project_task(client) -> None:
    resp = client.post("/v1/planning/backlogs/bg/tasks", json={"task_id": "t1", "position": 0})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_global_backlog_accepts_global_task(client) -> None:
    resp = client.post("/v1/planning/backlogs/bg/tasks", json={"task_id": "tg", "position": 0})
    assert resp.status_code == 200
    assert resp.json()["data"]["task_id"] == "tg"


# ── Remove task ──────────────────────────────────────────────────────────


def test_remove_task_from_backlog(client) -> None:
    client.post("/v1/planning/backlogs/b1/tasks", json={"task_id": "t1", "position": 0})
    resp = client.delete("/v1/planning/backlogs/b1/tasks/t1")
    assert resp.status_code == 204

    resp_again = client.delete("/v1/planning/backlogs/b1/tasks/t1")
    assert resp_again.status_code == 404


# ── Reorder ──────────────────────────────────────────────────────────────


def test_reorder_stories(client) -> None:
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s1", "position": 0})
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s2", "position": 1})

    resp = client.patch(
        "/v1/planning/backlogs/b1/reorder",
        json={
            "stories": [
                {"story_id": "s2", "position": 0},
                {"story_id": "s1", "position": 1},
            ],
            "tasks": [],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["data"] == {"updated_story_count": 2, "updated_task_count": 0}


def test_reorder_tasks(client) -> None:
    client.post("/v1/planning/backlogs/b1/tasks", json={"task_id": "t1", "position": 0})
    client.post("/v1/planning/backlogs/b1/tasks", json={"task_id": "t2", "position": 1})

    resp = client.patch(
        "/v1/planning/backlogs/b1/reorder",
        json={
            "stories": [],
            "tasks": [
                {"task_id": "t2", "position": 0},
                {"task_id": "t1", "position": 1},
            ],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["data"] == {"updated_story_count": 0, "updated_task_count": 2}


def test_reorder_requires_membership(client) -> None:
    resp = client.patch(
        "/v1/planning/backlogs/b1/reorder",
        json={"stories": [{"story_id": "s1", "position": 0}], "tasks": []},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_reorder_nonexistent_backlog(client) -> None:
    resp = client.patch(
        "/v1/planning/backlogs/nope/reorder",
        json={"stories": [], "tasks": []},
    )
    assert resp.status_code == 404


def test_reorder_rejects_duplicate_ids(client) -> None:
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s1", "position": 0})
    resp = client.patch(
        "/v1/planning/backlogs/b1/reorder",
        json={
            "stories": [
                {"story_id": "s1", "position": 0},
                {"story_id": "s1", "position": 1},
            ],
            "tasks": [],
        },
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_reorder_rejects_duplicate_positions(client) -> None:
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s1", "position": 0})
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s2", "position": 1})
    resp = client.patch(
        "/v1/planning/backlogs/b1/reorder",
        json={
            "stories": [
                {"story_id": "s1", "position": 0},
                {"story_id": "s2", "position": 0},
            ],
            "tasks": [],
        },
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_reorder_rejects_non_contiguous_positions(client) -> None:
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s1", "position": 0})
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s2", "position": 1})
    resp = client.patch(
        "/v1/planning/backlogs/b1/reorder",
        json={
            "stories": [
                {"story_id": "s1", "position": 0},
                {"story_id": "s2", "position": 5},
            ],
            "tasks": [],
        },
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_reorder_rejects_partial_story_list(client) -> None:
    """Reorder must include ALL stories in the backlog."""
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s1", "position": 0})
    client.post("/v1/planning/backlogs/b1/stories", json={"story_id": "s2", "position": 1})
    resp = client.patch(
        "/v1/planning/backlogs/b1/reorder",
        json={
            "stories": [{"story_id": "s1", "position": 0}],
            "tasks": [],
        },
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_reorder_empty_backlog(client) -> None:
    """Reorder with empty payload on empty backlog succeeds."""
    resp = client.patch(
        "/v1/planning/backlogs/b1/reorder",
        json={"stories": [], "tasks": []},
    )
    assert resp.status_code == 200
    assert resp.json()["data"] == {"updated_story_count": 0, "updated_task_count": 0}
