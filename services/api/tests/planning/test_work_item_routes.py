"""Tests for the /v1/planning/work-items endpoints."""

PREFIX = "/v1/planning/work-items"


class TestCreateWorkItem:
    def test_create_story(self, client):
        resp = client.post(
            PREFIX,
            json={
                "type": "STORY",
                "title": "New Story",
                "project_id": "p1",
                "sub_type": "USER_STORY",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["type"] == "STORY"
        assert data["title"] == "New Story"
        assert data["sub_type"] == "USER_STORY"
        assert data["project_id"] == "p1"
        assert data["key"] is not None
        assert data["status"] == "TODO"

    def test_create_task_under_story(self, client):
        resp = client.post(
            PREFIX,
            json={
                "type": "TASK",
                "title": "New Task",
                "parent_id": "s1",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["type"] == "TASK"
        assert data["parent_id"] == "s1"
        assert data["project_id"] == "p1"

    def test_create_epic(self, client):
        resp = client.post(
            PREFIX,
            json={
                "type": "EPIC",
                "title": "New Epic",
                "project_id": "p1",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["type"] == "EPIC"

    def test_create_bug(self, client):
        resp = client.post(
            PREFIX,
            json={
                "type": "BUG",
                "title": "Bug Report",
                "project_id": "p1",
            },
        )
        assert resp.status_code == 201
        assert resp.json()["type"] == "BUG"

    def test_invalid_type_rejected(self, client):
        resp = client.post(
            PREFIX,
            json={"type": "INVALID", "title": "Bad"},
        )
        assert resp.status_code == 422


class TestListWorkItems:
    def test_list_all(self, client):
        resp = client.get(PREFIX, params={"limit": 50})
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["total"] >= 5

    def test_filter_by_type(self, client):
        resp = client.get(PREFIX, params={"type": "EPIC"})
        assert resp.status_code == 200
        items = resp.json()["data"]
        assert all(i["type"] == "EPIC" for i in items)

    def test_filter_by_project(self, client):
        resp = client.get(PREFIX, params={"project_id": "p1"})
        assert resp.status_code == 200
        items = resp.json()["data"]
        assert all(i["project_id"] == "p1" for i in items)

    def test_filter_by_parent(self, client):
        resp = client.get(PREFIX, params={"parent_id": "e1"})
        assert resp.status_code == 200
        items = resp.json()["data"]
        assert len(items) >= 1
        assert all(i["parent_id"] == "e1" for i in items)


class TestGetWorkItem:
    def test_get_by_id(self, client):
        resp = client.get(f"{PREFIX}/s1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "s1"
        assert "children_count" in data

    def test_get_by_key(self, client):
        resp = client.get(f"{PREFIX}/by-key/P1-2")
        assert resp.status_code == 200
        assert resp.json()["id"] == "s1"

    def test_not_found(self, client):
        resp = client.get(f"{PREFIX}/nonexistent")
        assert resp.status_code == 404


class TestUpdateWorkItem:
    def test_update_title(self, client):
        resp = client.patch(
            f"{PREFIX}/s1",
            json={"title": "Updated Story"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Story"

    def test_update_status(self, client):
        resp = client.patch(
            f"{PREFIX}/s1",
            json={"status": "IN_PROGRESS"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "IN_PROGRESS"
        assert data["started_at"] is not None

    def test_blocked_cannot_done(self, client):
        client.patch(f"{PREFIX}/t1", json={"is_blocked": True, "blocked_reason": "dependency"})
        resp = client.patch(f"{PREFIX}/t1", json={"status": "DONE"})
        assert resp.status_code == 400


class TestDeleteWorkItem:
    def test_delete(self, client):
        resp = client.delete(f"{PREFIX}/t2")
        assert resp.status_code == 204

    def test_delete_not_found(self, client):
        resp = client.delete(f"{PREFIX}/nonexistent")
        assert resp.status_code == 404


class TestChildren:
    def test_list_children(self, client):
        resp = client.get(f"{PREFIX}/e1/children")
        assert resp.status_code == 200
        items = resp.json()["data"]
        assert len(items) >= 1
        assert all(i["parent_id"] == "e1" for i in items)


class TestLabels:
    def test_attach_and_detach(self, client):
        # Create a label first.
        label_resp = client.post(
            "/v1/planning/labels",
            json={"name": "test-label", "project_id": "p1"},
        )
        label_id = label_resp.json()["data"]["id"]

        # Attach.
        resp = client.post(
            f"{PREFIX}/s1/labels",
            json={"label_id": label_id},
        )
        assert resp.status_code == 201

        # Duplicate attach -> conflict.
        resp = client.post(
            f"{PREFIX}/s1/labels",
            json={"label_id": label_id},
        )
        assert resp.status_code == 409

        # Detach.
        resp = client.delete(f"{PREFIX}/s1/labels/{label_id}")
        assert resp.status_code == 204


class TestAssignments:
    def test_assign_and_unassign(self, client):
        resp = client.post(
            f"{PREFIX}/s1/assignments",
            json={"agent_id": "a1"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["agent_id"] == "a1"
        assert data["work_item_id"] == "s1"

        # List assignments.
        resp = client.get(f"{PREFIX}/s1/assignments")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

        # Unassign.
        resp = client.delete(f"{PREFIX}/s1/assignments/current")
        assert resp.status_code == 204
