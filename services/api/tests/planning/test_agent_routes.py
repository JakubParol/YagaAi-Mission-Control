"""
Integration tests for the Agents CRUD API.

Covers: POST /v1/planning/agents, GET list, GET single,
PATCH update, DELETE, plus validation and filtering.
"""

import json

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
    assert data["last_name"] is None
    assert data["initials"] is None
    assert data["role"] is None
    assert data["worker_type"] is None
    assert data["avatar"] is None


def test_create_agent_with_all_fields(client):
    resp = client.post(
        PREFIX,
        json={
            "openclaw_key": "full-agent",
            "name": "Full Agent",
            "last_name": "Runner",
            "initials": "fr",
            "role": "researcher",
            "worker_type": "llm",
            "avatar": "https://cdn.example.com/full-agent.png",
            "is_active": False,
            "source": "openclaw_json",
            "metadata_json": '{"tier": "premium"}',
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["last_name"] == "Runner"
    assert data["initials"] == "FR"
    assert data["role"] == "researcher"
    assert data["worker_type"] == "llm"
    assert data["avatar"] == "https://cdn.example.com/full-agent.png"
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


def test_create_agent_invalid_avatar(client):
    resp = client.post(
        PREFIX,
        json={"openclaw_key": "x", "name": "X", "avatar": "not a valid avatar"},
    )
    assert resp.status_code == 422
    assert any(err["loc"][-1] == "avatar" for err in resp.json()["detail"])


def test_create_agent_invalid_initials(client):
    resp = client.post(
        PREFIX,
        json={"openclaw_key": "x", "name": "X", "initials": "A1"},
    )
    assert resp.status_code == 422
    assert any(err["loc"][-1] == "initials" for err in resp.json()["detail"])


# ── List ─────────────────────────────────────────────────────────────────


def test_list_agents_seeded(client):
    resp = client.get(PREFIX)
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 2
    assert len(body["data"]) == 2
    assert "avatar" in body["data"][0]
    assert "last_name" in body["data"][0]
    assert "initials" in body["data"][0]


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
    assert data["name"] == "Agent"
    assert data["last_name"] == "Alpha"
    assert data["initials"] == "AA"
    assert data["role"] == "developer"
    assert data["avatar"] == "https://cdn.example.com/agent-1.png"


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


def test_update_agent_last_name(client):
    resp = client.patch(f"{PREFIX}/a1", json={"last_name": "Prime"})
    assert resp.status_code == 200
    assert resp.json()["data"]["last_name"] == "Prime"


def test_update_agent_clear_last_name_with_empty_string(client):
    resp = client.patch(f"{PREFIX}/a1", json={"last_name": ""})
    assert resp.status_code == 200
    assert resp.json()["data"]["last_name"] is None


def test_update_agent_initials(client):
    resp = client.patch(f"{PREFIX}/a1", json={"initials": "ap"})
    assert resp.status_code == 200
    assert resp.json()["data"]["initials"] == "AP"


def test_update_agent_clear_initials_with_empty_string(client):
    resp = client.patch(f"{PREFIX}/a1", json={"initials": ""})
    assert resp.status_code == 200
    assert resp.json()["data"]["initials"] is None


def test_update_agent_avatar(client):
    resp = client.patch(f"{PREFIX}/a1", json={"avatar": "/avatars/alpha.png"})
    assert resp.status_code == 200
    assert resp.json()["data"]["avatar"] == "/avatars/alpha.png"


def test_update_agent_clear_avatar(client):
    resp = client.patch(f"{PREFIX}/a1", json={"avatar": None})
    assert resp.status_code == 200
    assert resp.json()["data"]["avatar"] is None


def test_update_agent_clear_avatar_with_empty_string(client):
    resp = client.patch(f"{PREFIX}/a1", json={"avatar": ""})
    assert resp.status_code == 200
    assert resp.json()["data"]["avatar"] is None


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


def test_update_agent_invalid_avatar(client):
    resp = client.patch(f"{PREFIX}/a1", json={"avatar": "?? bad avatar ??"})
    assert resp.status_code == 422
    assert any(err["loc"][-1] == "avatar" for err in resp.json()["detail"])


def test_update_agent_invalid_initials(client):
    resp = client.patch(f"{PREFIX}/a1", json={"initials": "AP-1"})
    assert resp.status_code == 422
    assert any(err["loc"][-1] == "initials" for err in resp.json()["detail"])


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


def test_list_agents_filter_by_openclaw_key_alias(client):
    resp = client.get(f"{PREFIX}?openclaw_key=agent-1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 1
    assert body["data"][0]["openclaw_key"] == "agent-1"


def _write_openclaw_config(tmp_path, agents):
    path = tmp_path / "openclaw.json"
    payload = {"agents": {"list": agents}}
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


# ── Sync ───────────────────────────────────────────────────────────────────


def test_sync_agents_upsert_and_deactivate(client, tmp_path, monkeypatch):
    from app.config import settings

    path = _write_openclaw_config(
        tmp_path,
        [
            {
                "id": "main",
                "name": "james",
                "lastName": "bond",
                "initials": "jb",
                "role": "lead",
                "worker_type": "worker",
                "active": True,
            },
            {
                "id": "naomi",
                "name": "naomi",
                "role": "reviewer",
                "worker_type": "worker",
                "active": True,
            },
        ],
    )
    monkeypatch.setattr(settings, "openclaw_config_path", str(path))

    # Existing OpenClaw-sourced entry should be updated in place.
    existing = client.post(
        PREFIX,
        json={
            "openclaw_key": "james",
            "name": "James Old",
            "role": "old",
            "worker_type": "legacy",
            "source": "openclaw_json",
            "metadata_json": '{"old":true}',
        },
    )
    assert existing.status_code == 201
    james_id = existing.json()["data"]["id"]

    # Existing OpenClaw-sourced entry absent in config should be deactivated.
    stale = client.post(
        PREFIX,
        json={
            "openclaw_key": "legacy-openclaw",
            "name": "Legacy",
            "source": "openclaw_json",
        },
    )
    assert stale.status_code == 201
    stale_id = stale.json()["data"]["id"]

    resp = client.post(f"{PREFIX}/sync")
    assert resp.status_code == 200
    summary = resp.json()["data"]
    assert summary == {
        "created": 1,
        "updated": 1,
        "deactivated": 1,
        "unchanged": 0,
        "errors": 0,
    }

    james = client.get(f"{PREFIX}/{james_id}").json()["data"]
    assert james["name"] == "james"
    assert james["last_name"] == "bond"
    assert james["initials"] == "JB"
    assert james["role"] == "lead"
    assert james["worker_type"] == "worker"
    assert james["avatar"] is None
    assert james["source"] == "openclaw_json"
    assert james["is_active"] is True
    assert james["last_synced_at"] is not None

    stale_agent = client.get(f"{PREFIX}/{stale_id}").json()["data"]
    assert stale_agent["is_active"] is False
    assert stale_agent["source"] == "openclaw_json"

    # Seeded manual record stays untouched by deactivation pass.
    manual = client.get(f"{PREFIX}/a1").json()["data"]
    assert manual["source"] == "manual"
    assert manual["is_active"] is True

    naomi = client.get(PREFIX, params={"key": "naomi"}).json()["data"][0]
    assert naomi["name"] == "naomi"
    assert naomi["source"] == "openclaw_json"


def test_sync_agents_is_idempotent(client, tmp_path, monkeypatch):
    from app.config import settings

    path = _write_openclaw_config(
        tmp_path,
        [
            {"name": "james", "id": "main"},
            {"name": "naomi", "id": "naomi"},
        ],
    )
    monkeypatch.setattr(settings, "openclaw_config_path", str(path))

    first = client.post(f"{PREFIX}/sync")
    assert first.status_code == 200
    assert first.json()["data"]["created"] == 2

    second = client.post(f"{PREFIX}/sync")
    assert second.status_code == 200
    summary = second.json()["data"]
    assert summary["created"] == 0
    assert summary["updated"] == 0
    assert summary["deactivated"] == 0
    assert summary["errors"] == 0
    assert summary["unchanged"] == 2
