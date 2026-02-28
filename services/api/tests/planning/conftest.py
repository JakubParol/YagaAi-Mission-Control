import os
import sqlite3

import pytest

os.environ["MC_API_DB_PATH"] = ""

TS = "2026-01-01T00:00:00Z"


@pytest.fixture(autouse=True)
def _setup_test_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "planning.db")
    conn = sqlite3.connect(db_path)
    conn.executescript("""
        PRAGMA foreign_keys = ON;

        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL,
          repo_root TEXT,
          created_by TEXT,
          updated_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE project_counters (
          project_id TEXT PRIMARY KEY,
          next_number INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE epics (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'TODO',
          status_mode TEXT NOT NULL DEFAULT 'MANUAL',
          status_override TEXT,
          status_override_set_at TEXT,
          is_blocked INTEGER NOT NULL DEFAULT 0,
          blocked_reason TEXT,
          priority INTEGER,
          metadata_json TEXT,
          created_by TEXT,
          updated_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(project_id, key)
        );

        CREATE TABLE stories (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
          key TEXT,
          title TEXT NOT NULL,
          intent TEXT,
          description TEXT,
          story_type TEXT NOT NULL,
          status TEXT NOT NULL,
          status_mode TEXT NOT NULL,
          status_override TEXT,
          status_override_set_at TEXT,
          is_blocked INTEGER NOT NULL DEFAULT 0,
          blocked_reason TEXT,
          priority INTEGER,
          metadata_json TEXT,
          created_by TEXT,
          updated_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        );

        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          story_id TEXT REFERENCES stories(id) ON DELETE SET NULL,
          key TEXT,
          title TEXT NOT NULL,
          objective TEXT,
          task_type TEXT NOT NULL,
          status TEXT NOT NULL,
          is_blocked INTEGER NOT NULL DEFAULT 0,
          blocked_reason TEXT,
          priority INTEGER,
          estimate_points REAL,
          due_at TEXT,
          current_assignee_agent_id TEXT,
          metadata_json TEXT,
          created_by TEXT,
          updated_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT
        );

        CREATE TABLE backlogs (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          status TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          goal TEXT,
          start_date TEXT,
          end_date TEXT,
          metadata_json TEXT,
          created_by TEXT,
          updated_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE backlog_stories (
          backlog_id TEXT NOT NULL REFERENCES backlogs(id) ON DELETE CASCADE,
          story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          added_at TEXT NOT NULL,
          PRIMARY KEY (backlog_id, story_id),
          UNIQUE(story_id)
        );

        CREATE TABLE backlog_tasks (
          backlog_id TEXT NOT NULL REFERENCES backlogs(id) ON DELETE CASCADE,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          added_at TEXT NOT NULL,
          PRIMARY KEY (backlog_id, task_id),
          UNIQUE(task_id)
        );

        CREATE TABLE labels (
          id         TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          name       TEXT NOT NULL,
          color      TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE story_labels (
          story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
          label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
          added_at TEXT NOT NULL,
          PRIMARY KEY (story_id, label_id)
        );

        CREATE TABLE task_labels (
          task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
          added_at TEXT NOT NULL,
          PRIMARY KEY (task_id, label_id)
        );

        CREATE TABLE agents (
          id             TEXT PRIMARY KEY,
          openclaw_key   TEXT NOT NULL UNIQUE,
          name           TEXT NOT NULL,
          role           TEXT,
          worker_type    TEXT,
          is_active      INTEGER NOT NULL DEFAULT 1,
          source         TEXT NOT NULL DEFAULT 'manual',
          metadata_json  TEXT,
          last_synced_at TEXT,
          created_at     TEXT NOT NULL,
          updated_at     TEXT NOT NULL
        );

        CREATE TABLE task_assignments (
          id            TEXT PRIMARY KEY,
          task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          assigned_at   TEXT NOT NULL,
          unassigned_at TEXT,
          assigned_by   TEXT,
          reason        TEXT
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_task_assignments_active
          ON task_assignments(task_id) WHERE unassigned_at IS NULL;
        """)

    conn.executescript(f"""
        INSERT INTO projects (id, key, name, description, status, created_at, updated_at)
        VALUES
          ('p1', 'P1', 'Project 1', NULL, 'ACTIVE', '{TS}', '{TS}'),
          ('p2', 'P2', 'Project 2', NULL, 'ACTIVE', '{TS}', '{TS}');

        INSERT INTO project_counters (project_id, next_number, updated_at)
        VALUES
          ('p1', 1, '{TS}'),
          ('p2', 1, '{TS}');

        INSERT INTO backlogs (id, project_id, name, kind, status, is_default, created_at, updated_at)
        VALUES
          ('b1', 'p1', 'P1 Backlog', 'BACKLOG', 'ACTIVE', 0, '{TS}', '{TS}'),
          ('b2', 'p1', 'P1 Sprint', 'SPRINT', 'ACTIVE', 0, '{TS}', '{TS}'),
          ('bg', NULL, 'Global Backlog', 'BACKLOG', 'ACTIVE', 0, '{TS}', '{TS}');

        INSERT INTO stories (id, project_id, title, story_type, status, status_mode, created_at, updated_at)
        VALUES
          ('s1', 'p1', 'Story 1', 'USER_STORY', 'TODO', 'MANUAL', '{TS}', '{TS}'),
          ('s2', 'p1', 'Story 2', 'USER_STORY', 'TODO', 'MANUAL', '{TS}', '{TS}'),
          ('sp2', 'p2', 'Story P2', 'USER_STORY', 'TODO', 'MANUAL', '{TS}', '{TS}'),
          ('sg', NULL, 'Global Story', 'USER_STORY', 'TODO', 'MANUAL', '{TS}', '{TS}');

        INSERT INTO tasks (id, project_id, title, task_type, status, created_at, updated_at)
        VALUES
          ('t1', 'p1', 'Task 1', 'TASK', 'TODO', '{TS}', '{TS}'),
          ('t2', 'p1', 'Task 2', 'TASK', 'TODO', '{TS}', '{TS}'),
          ('tp2', 'p2', 'Task P2', 'TASK', 'TODO', '{TS}', '{TS}'),
          ('tg', NULL, 'Global Task', 'TASK', 'TODO', '{TS}', '{TS}');

        INSERT INTO agents (id, openclaw_key, name, role, is_active, source, created_at, updated_at)
        VALUES
          ('a1', 'agent-1', 'Agent Alpha', 'developer', 1, 'manual', '{TS}', '{TS}'),
          ('a2', 'agent-2', 'Agent Beta', 'reviewer', 1, 'manual', '{TS}', '{TS}');
        """)
    conn.close()

    from app.config import settings

    monkeypatch.setattr(settings, "db_path", db_path)
    return db_path


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)
