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
          ('p1', 6, '{TS}'),
          ('p2', 1, '{TS}');

        INSERT INTO backlogs (
          id, project_id, name, kind, status, rank, is_default, created_at, updated_at
        )
        VALUES
          ('b1', 'p1', 'P1 Backlog', 'BACKLOG', 'ACTIVE', 'n', 1, '{TS}', '{TS}'),
          ('b2', 'p1', 'P1 Sprint', 'SPRINT', 'ACTIVE', 'g', 0, '{TS}', '{TS}'),
          ('bg', NULL, 'Global Backlog', 'BACKLOG', 'ACTIVE', 'n', 0, '{TS}', '{TS}');

        INSERT INTO work_items (id, project_id, parent_id, key, type, sub_type,
          title, summary, status, status_mode, is_blocked, created_at, updated_at)
        VALUES
          ('e1', 'p1', NULL, 'P1-1', 'EPIC', NULL, 'Epic 1', NULL, 'TODO', 'MANUAL', 0, '{TS}', '{TS}'),
          ('s1', 'p1', 'e1', 'P1-2', 'STORY', 'USER_STORY', 'Story 1', NULL, 'TODO', 'MANUAL', 0, '{TS}', '{TS}'),
          ('s2', 'p1', NULL, 'P1-3', 'STORY', 'USER_STORY', 'Story 2', NULL, 'TODO', 'MANUAL', 0, '{TS}', '{TS}'),
          ('t1', 'p1', 's1', 'P1-4', 'TASK', 'CODING', 'Task 1', NULL, 'TODO', 'MANUAL', 0, '{TS}', '{TS}'),
          ('t2', 'p1', NULL, 'P1-5', 'TASK', 'CODING', 'Task 2', NULL, 'TODO', 'MANUAL', 0, '{TS}', '{TS}'),
          ('sp2', 'p2', NULL, NULL, 'STORY', 'USER_STORY', 'Story P2', NULL, 'TODO', 'MANUAL', 0, '{TS}', '{TS}'),
          ('sg', NULL, NULL, NULL, 'STORY', 'USER_STORY', 'Global Story', NULL, 'TODO', 'MANUAL', 0, '{TS}', '{TS}');

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
