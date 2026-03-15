import pytest

from tests.support.postgres_compat import run_script

TS = "2026-01-01T00:00:00Z"


@pytest.fixture(autouse=True)
def _setup_test_db(database_url: str):
    run_script(
        database_url,
        f"""
        INSERT INTO projects (id, key, name, description, status, created_at, updated_at)
        VALUES
          ('p1', 'P1', 'Project 1', NULL, 'ACTIVE', '{TS}', '{TS}'),
          ('p2', 'P2', 'Project 2', NULL, 'ACTIVE', '{TS}', '{TS}');

        INSERT INTO project_counters (project_id, next_number, updated_at)
        VALUES
          ('p1', 1, '{TS}'),
          ('p2', 1, '{TS}');

        INSERT INTO backlogs (
          id, project_id, name, kind, status, display_order, is_default, created_at, updated_at
        )
        VALUES
          ('b1', 'p1', 'P1 Backlog', 'BACKLOG', 'ACTIVE', 200, 0, '{TS}', '{TS}'),
          ('b2', 'p1', 'P1 Sprint', 'SPRINT', 'ACTIVE', 100, 0, '{TS}', '{TS}'),
          ('bg', NULL, 'Global Backlog', 'BACKLOG', 'ACTIVE', 100, 0, '{TS}', '{TS}');

        INSERT INTO stories (id, project_id, title, story_type, status, created_at, updated_at)
        VALUES
          ('s1', 'p1', 'Story 1', 'USER_STORY', 'TODO', '{TS}', '{TS}'),
          ('s2', 'p1', 'Story 2', 'USER_STORY', 'TODO', '{TS}', '{TS}'),
          ('sp2', 'p2', 'Story P2', 'USER_STORY', 'TODO', '{TS}', '{TS}'),
          ('sg', NULL, 'Global Story', 'USER_STORY', 'TODO', '{TS}', '{TS}');

        INSERT INTO tasks (id, project_id, title, task_type, status, created_at, updated_at)
        VALUES
          ('t1', 'p1', 'Task 1', 'TASK', 'TODO', '{TS}', '{TS}'),
          ('t2', 'p1', 'Task 2', 'TASK', 'TODO', '{TS}', '{TS}'),
          ('tp2', 'p2', 'Task P2', 'TASK', 'TODO', '{TS}', '{TS}'),
          ('tg', NULL, 'Global Task', 'TASK', 'TODO', '{TS}', '{TS}');

        INSERT INTO agents (id, openclaw_key, name, last_name, initials, role, avatar, is_active, source, created_at, updated_at)
        VALUES
          (
            'a1', 'agent-1', 'Agent', 'Alpha', 'AA', 'developer',
            'https://cdn.example.com/agent-1.png', 1, 'manual', '{TS}', '{TS}'
          ),
          ('a2', 'agent-2', 'Agent', 'Beta', NULL, 'reviewer', NULL, 1, 'manual', '{TS}', '{TS}');
        """,
    )
    return database_url


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)
