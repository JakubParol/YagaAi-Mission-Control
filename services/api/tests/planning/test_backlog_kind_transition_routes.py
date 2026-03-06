"""Integration tests for backlog kind transition endpoint."""

PREFIX = "/v1/planning/backlogs"


def test_transition_backlog_kind_backlog_to_ideas(client) -> None:
    resp = client.post(f"{PREFIX}/b1/transition-kind", json={"kind": "IDEAS"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["kind"] == "IDEAS"
    assert body["data"]["status"] == "ACTIVE"
    assert body["meta"]["transition"] == "TRANSITION_BACKLOG_KIND"
    assert body["meta"]["from_kind"] == "BACKLOG"
    assert body["meta"]["to_kind"] == "IDEAS"
    assert body["meta"]["changed"] is True


def test_transition_backlog_kind_to_sprint_forces_open_status(client) -> None:
    create_resp = client.post(
        PREFIX,
        json={"project_id": "p2", "name": "Roadmap", "kind": "IDEAS"},
    )
    assert create_resp.status_code == 201
    backlog_id = create_resp.json()["data"]["id"]

    resp = client.post(
        f"{PREFIX}/{backlog_id}/transition-kind?project_id=p2",
        json={"kind": "SPRINT"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["kind"] == "SPRINT"
    assert body["data"]["status"] == "OPEN"
    assert body["meta"]["from_status"] == "ACTIVE"
    assert body["meta"]["to_status"] == "OPEN"


def test_transition_backlog_kind_rejects_active_sprint(client) -> None:
    resp = client.post(f"{PREFIX}/b2/transition-kind?project_id=p1", json={"kind": "IDEAS"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_transition_backlog_kind_rejects_scope_mismatch(client) -> None:
    resp = client.post(f"{PREFIX}/b1/transition-kind?project_id=p2", json={"kind": "IDEAS"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_transition_backlog_kind_rejects_global_to_sprint(client) -> None:
    resp = client.post(f"{PREFIX}/bg/transition-kind", json={"kind": "SPRINT"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_transition_backlog_kind_rejects_second_active_product_backlog(client) -> None:
    create_resp = client.post(
        PREFIX,
        json={"project_id": "p1", "name": "Ideas X", "kind": "IDEAS"},
    )
    assert create_resp.status_code == 201
    backlog_id = create_resp.json()["data"]["id"]

    resp = client.post(
        f"{PREFIX}/{backlog_id}/transition-kind?project_id=p1",
        json={"kind": "BACKLOG"},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CONFLICT"
