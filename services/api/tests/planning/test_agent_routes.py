"""
Integration tests for the Agents CRUD API.

Covers: POST /v1/planning/agents, GET list, GET single,
PATCH update, DELETE, plus validation and filtering.
"""

PREFIX = "/v1/planning/agents"


# ── Create ───────────────────────────────────────────────────────────────


def test_create_agent(client):
    resp = client.post(
        PREFIX,
        json={"openclaw_key": "new-agent", "name": "New Agent"},
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["openclaw_key"] == "new-agent"
    assert data["name"] == "New Agent"
    assert data["is_active"] is True
    assert data["source"] == "manual"
    assert data["role"] is None
    assert data["worker_type"] is None


def test_create_agent_with_all_fields(client):
    resp = client.post(
        PREFIX,
        json={
            "openclaw_key": "full-agent",
            "name": "Full Agent",
            "role": "researcher",
            "worker_type": "llm",
            "is_active": False,
            "source": "openclaw_json",
            "metadata_json": '{"tier": "premium"}',
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["role"] == "researcher"
    assert data["worker_type"] == "llm"
    assert data["is_active"] is False
    assert data["source"] == "openclaw_json"
    assert data["metadata_json"] == '{"tier": "premium"}'


def test_create_agent_empty_name_validation(client):
    resp = client.post(PREFIX, json={"openclaw_key": "x", "name": ""})
    assert resp.status_code == 422


def test_create_agent_empty_key_validation(client):
    resp = client.post(PREFIX, json={"openclaw_key": "", "name": "X"})
    assert resp.status_code == 422


def test_create_agent_invalid_source(client):
    resp = client.post(
        PREFIX,
        json={"openclaw_key": "x", "name": "X", "source": "invalid"},
    )
    assert resp.status_code == 422


# ── List ─────────────────────────────────────────────────────────────────


def test_list_agents_seeded(client):
    resp = client.get(PREFIX)
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 2
    assert len(body["data"]) == 2


def test_list_agents_filter_active(client):
    resp = client.get(f"{PREFIX}?is_active=true")
    assert resp.status_code == 200
    assert resp.json()["meta"]["total"] == 2


def test_list_agents_filter_inactive(client):
    client.post(
        PREFIX,
        json={"openclaw_key": "inactive", "name": "Inactive", "is_active": False},
    )
    resp = client.get(f"{PREFIX}?is_active=false")
    assert resp.status_code == 200
    assert resp.json()["meta"]["total"] == 1
    assert resp.json()["data"][0]["name"] == "Inactive"


def test_list_agents_filter_by_source(client):
    resp = client.get(f"{PREFIX}?source=manual")
    assert resp.status_code == 200
    assert resp.json()["meta"]["total"] == 2


def test_list_agents_pagination(client):
    resp = client.get(f"{PREFIX}?limit=1&offset=0")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["meta"]["total"] == 2


def test_list_agents_sort_by_name(client):
    resp = client.get(f"{PREFIX}?sort=name")
    assert resp.status_code == 200
    names = [a["name"] for a in resp.json()["data"]]
    assert names == sorted(names)


def test_list_agents_sort_invalid_column(client):
    resp = client.get(f"{PREFIX}?sort=nonexistent")
    assert resp.status_code == 400


# ── Get single ───────────────────────────────────────────────────────────


def test_get_agent(client):
    resp = client.get(f"{PREFIX}/a1")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["id"] == "a1"
    assert data["name"] == "Agent Alpha"
    assert data["role"] == "developer"


def test_get_agent_not_found(client):
    resp = client.get(f"{PREFIX}/nonexistent")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


# ── Update ───────────────────────────────────────────────────────────────


def test_update_agent_name(client):
    resp = client.patch(f"{PREFIX}/a1", json={"name": "Renamed"})
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "Renamed"


def test_update_agent_role(client):
    resp = client.patch(f"{PREFIX}/a1", json={"role": "tester"})
    assert resp.status_code == 200
    assert resp.json()["data"]["role"] == "tester"


def test_update_agent_deactivate(client):
    resp = client.patch(f"{PREFIX}/a1", json={"is_active": False})
    assert resp.status_code == 200
    assert resp.json()["data"]["is_active"] is False


def test_update_agent_source(client):
    resp = client.patch(f"{PREFIX}/a1", json={"source": "openclaw_json"})
    assert resp.status_code == 200
    assert resp.json()["data"]["source"] == "openclaw_json"


def test_update_agent_not_found(client):
    resp = client.patch(f"{PREFIX}/nonexistent", json={"name": "X"})
    assert resp.status_code == 404


def test_update_agent_invalid_source(client):
    resp = client.patch(f"{PREFIX}/a1", json={"source": "invalid"})
    assert resp.status_code == 422


# ── Delete ───────────────────────────────────────────────────────────────


def test_delete_agent(client):
    resp = client.delete(f"{PREFIX}/a1")
    assert resp.status_code == 204

    get_resp = client.get(f"{PREFIX}/a1")
    assert get_resp.status_code == 404


def test_delete_agent_not_found(client):
    resp = client.delete(f"{PREFIX}/nonexistent")
    assert resp.status_code == 404


# ── Key filter ────────────────────────────────────────────────────────────


def test_list_agents_filter_by_key(client):
    resp = client.get(f"{PREFIX}?key=agent-1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 1
    assert body["data"][0]["openclaw_key"] == "agent-1"


def test_list_agents_filter_by_key_no_match(client):
    resp = client.get(f"{PREFIX}?key=nonexistent-agent")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 0
    assert body["data"] == []
