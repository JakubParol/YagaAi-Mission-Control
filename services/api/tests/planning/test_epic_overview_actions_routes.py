from tests.support.postgres_compat import pg_connect

TS = "2026-01-01T00:00:00Z"


def _activity_count(db_path: str, event_name: str) -> int:
    with pg_connect(db_path) as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM activity_log WHERE event_name = %s",
            [event_name],
        ).fetchone()
    return int(row[0]) if row else 0


def test_change_epic_status_quick_action_and_audit(client, _setup_test_db) -> None:
    epic = client.post(
        "/v1/planning/epics",
        json={"project_id": "p1", "title": "Epic quick action"},
    ).json()["data"]

    resp = client.post(
        f"/v1/planning/epics/{epic['id']}/status",
        json={"status": "IN_PROGRESS"},
        headers={"X-Actor-Id": "agent-1", "X-Actor-Type": "agent"},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["epic_id"] == epic["id"]
    assert data["from_status"] == "TODO"
    assert data["to_status"] == "IN_PROGRESS"
    assert data["actor_id"] == "agent-1"

    with pg_connect(_setup_test_db) as conn:
        row = conn.execute(
            "SELECT event_name, actor_id, actor_type, entity_type, entity_id FROM activity_log "
            "WHERE event_name = 'epic.status.changed' ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
    assert row == ("epic.status.changed", "agent-1", "agent", "epic", epic["id"])


def test_bulk_story_status_partial_failure_returns_per_record_report(
    client, _setup_test_db
) -> None:
    resp = client.post(
        "/v1/planning/epics/bulk/story-status",
        json={"story_ids": ["s1", "missing-story"], "status": "DONE"},
        headers={"X-Actor-Id": "agent-2", "X-Actor-Type": "agent"},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["operation"] == "BULK_UPDATE_STORY_STATUS"
    assert data["total"] == 2
    assert data["succeeded"] == 1
    assert data["failed"] == 1

    by_id = {item["entity_id"]: item for item in data["results"]}
    assert by_id["s1"]["success"] is True
    assert by_id["missing-story"]["success"] is False
    assert by_id["missing-story"]["error_code"] == "NOT_FOUND"

    # One audit row for the successful status change.
    assert _activity_count(_setup_test_db, "story.status.changed") == 1


def test_bulk_add_to_active_sprint_happy_and_partial_failure(client, _setup_test_db) -> None:
    # Eligible story in product backlog
    add_resp = client.post(
        "/v1/planning/backlogs/b1/stories",
        json={"story_id": "s1", "position": 0},
    )
    assert add_resp.status_code == 200

    # s2 is not in product backlog -> should fail per-record
    resp = client.post(
        "/v1/planning/epics/bulk/active-sprint/add?project_id=p1",
        json={"story_ids": ["s1", "s2"]},
        headers={"X-Actor-Id": "agent-3", "X-Actor-Type": "agent"},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["operation"] == "ADD_TO_ACTIVE_SPRINT"
    assert data["total"] == 2
    assert data["succeeded"] == 1
    assert data["failed"] == 1

    by_id = {item["entity_id"]: item for item in data["results"]}
    assert by_id["s1"]["success"] is True
    assert by_id["s2"]["success"] is False
    assert by_id["s2"]["error_code"] == "BUSINESS_RULE_VIOLATION"

    sprint_stories = client.get("/v1/planning/backlogs/b2/stories").json()["data"]
    assert [s["id"] for s in sprint_stories] == ["s1"]

    assert _activity_count(_setup_test_db, "story.sprint_membership.added") == 1


def test_bulk_remove_from_active_sprint_no_active_sprint_explicit_error(client) -> None:
    # p2 has no active sprint in seeded DB
    resp = client.post(
        "/v1/planning/epics/bulk/active-sprint/remove?project_id=p2",
        json={"story_ids": ["sp2"]},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total"] == 1
    assert data["succeeded"] == 0
    assert data["failed"] == 1
    assert data["results"][0]["success"] is False
    assert data["results"][0]["error_code"] == "NO_ACTIVE_SPRINT"
