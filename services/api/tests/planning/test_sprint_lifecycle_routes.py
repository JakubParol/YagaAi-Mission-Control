"""Integration tests for sprint lifecycle transition endpoints."""

PREFIX = "/v1/planning/backlogs"


def _ensure_product_backlog(client, project_id):
    """Return the product backlog id for a project, creating one if needed."""
    resp = client.get(f"{PREFIX}?project_id={project_id}&kind=BACKLOG")
    if resp.status_code == 200:
        backlogs = resp.json()["data"]
        if backlogs:
            return backlogs[0]["id"]
    create_resp = client.post(
        PREFIX,
        json={"project_id": project_id, "name": "Product Backlog", "kind": "BACKLOG"},
    )
    assert create_resp.status_code == 201
    return create_resp.json()["data"]["id"]


def _create_sprint(client, project_id: str, name: str = "Sprint X", status: str = "ACTIVE") -> str:
    create_resp = client.post(
        PREFIX,
        json={"project_id": project_id, "name": name, "kind": "SPRINT"},
    )
    assert create_resp.status_code == 201
    backlog_id = create_resp.json()["data"]["id"]

    if status in ("ACTIVE", "CLOSED"):
        start_resp = client.post(f"{PREFIX}/{backlog_id}/start?project_id={project_id}")
        assert start_resp.status_code == 200

    if status == "CLOSED":
        target_id = _ensure_product_backlog(client, project_id)
        complete_resp = client.post(
            f"{PREFIX}/{backlog_id}/complete?project_id={project_id}",
            json={"target_backlog_id": target_id},
        )
        assert complete_resp.status_code == 200

    return backlog_id


def _add_item_to_backlog(client, backlog_id: str, work_item_id: str) -> None:
    resp = client.post(
        f"{PREFIX}/{backlog_id}/items",
        json={"work_item_id": work_item_id},
    )
    assert resp.status_code == 201


def test_start_sprint_happy_path(client) -> None:
    sprint_id = _create_sprint(client, project_id="p2", status="OPEN")

    resp = client.post(f"{PREFIX}/{sprint_id}/start?project_id=p2")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["status"] == "ACTIVE"
    assert body["meta"]["transition"] == "START_SPRINT"
    assert body["meta"]["from_status"] == "OPEN"
    assert body["meta"]["to_status"] == "ACTIVE"
    assert body["meta"]["active_sprint_id"] == sprint_id


def test_start_sprint_rejects_non_sprint_backlog(client) -> None:
    resp = client.post(f"{PREFIX}/b1/start?project_id=p1")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_start_sprint_rejects_when_another_active_sprint_exists(client) -> None:
    sprint_id = _create_sprint(client, project_id="p1", name="Future sprint", status="OPEN")

    resp = client.post(f"{PREFIX}/{sprint_id}/start?project_id=p1")
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CONFLICT"


def test_start_sprint_project_scope_validation(client) -> None:
    resp = client.post(f"{PREFIX}/b2/start?project_id=p2")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_start_sprint_by_project_key(client) -> None:
    sprint_id = _create_sprint(client, project_id="p2", status="OPEN")

    resp = client.post(f"{PREFIX}/{sprint_id}/start?project_key=P2")
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "ACTIVE"


def test_complete_sprint_happy_path(client) -> None:
    target_id = _ensure_product_backlog(client, "p1")

    resp = client.post(
        f"{PREFIX}/b2/complete?project_id=p1",
        json={"target_backlog_id": target_id},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["status"] == "CLOSED"
    assert body["meta"]["transition"] == "COMPLETE_SPRINT"
    assert body["meta"]["from_status"] == "ACTIVE"
    assert body["meta"]["to_status"] == "CLOSED"


def test_complete_sprint_rejects_not_active(client) -> None:
    sprint_id = _create_sprint(client, project_id="p2", status="OPEN")
    target_id = _ensure_product_backlog(client, "p2")

    resp = client.post(
        f"{PREFIX}/{sprint_id}/complete?project_id=p2",
        json={"target_backlog_id": target_id},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_complete_sprint_rejects_non_sprint_backlog(client) -> None:
    resp = client.post(
        f"{PREFIX}/b1/complete?project_id=p1",
        json={"target_backlog_id": "b1"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_complete_sprint_project_scope_validation(client) -> None:
    target_id = _ensure_product_backlog(client, "p1")

    resp = client.post(
        f"{PREFIX}/b2/complete?project_id=p2",
        json={"target_backlog_id": target_id},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
