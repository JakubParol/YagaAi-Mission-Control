-- Mission Control PostgreSQL bootstrap schema (Phase 2A)
-- Generated from canonical SQLite schema baseline.
-- Intent: bootstrap empty PostgreSQL instance with current table/index surface.
-- Note: query dialect adaptations are handled in later migration phases.
-- TODO(MC-367, phase follow-up): migrate TEXT timestamps to TIMESTAMPTZ and INTEGER flags to BOOLEAN.


CREATE TABLE IF NOT EXISTS imports (
  id              BIGSERIAL PRIMARY KEY,
  started_at      TEXT    NOT NULL,
  finished_at     TEXT,
  mode            TEXT    NOT NULL CHECK (mode IN ('full', 'incremental')),
  from_timestamp  TEXT,
  to_timestamp    TEXT    NOT NULL,
  status          TEXT    NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  error_message   TEXT
);

CREATE TABLE IF NOT EXISTS langfuse_daily_metrics (
  date           TEXT    NOT NULL,
  model          TEXT    NOT NULL,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  total_tokens   INTEGER NOT NULL DEFAULT 0,
  request_count  INTEGER NOT NULL DEFAULT 0,
  total_cost     REAL    NOT NULL DEFAULT 0,
  PRIMARY KEY (date, model)
);

CREATE TABLE IF NOT EXISTS langfuse_requests (
  id             TEXT    PRIMARY KEY,
  trace_id       TEXT,
  name           TEXT,
  model          TEXT,
  started_at     TEXT,
  finished_at    TEXT,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  total_tokens   INTEGER NOT NULL DEFAULT 0,
  cost           REAL,
  latency_ms     INTEGER
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by  TEXT,
  updated_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
, repo_root TEXT, is_default INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS project_counters (
  project_id  TEXT PRIMARY KEY,
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
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
, avatar TEXT, last_name TEXT, initials TEXT);

CREATE TABLE IF NOT EXISTS epics (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key                   TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  status                TEXT NOT NULL DEFAULT 'TODO',
  status_mode           TEXT NOT NULL DEFAULT 'MANUAL',
  status_override       TEXT,
  status_override_set_at TEXT,
  is_blocked            INTEGER NOT NULL DEFAULT 0,
  blocked_reason        TEXT,
  priority              INTEGER,
  metadata_json         TEXT,
  created_by            TEXT,
  updated_by            TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE(project_id, key)
);

CREATE TABLE IF NOT EXISTS stories (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT REFERENCES projects(id) ON DELETE CASCADE,
  epic_id               TEXT REFERENCES epics(id) ON DELETE SET NULL,
  key                   TEXT,
  title                 TEXT NOT NULL,
  intent                TEXT,
  description           TEXT,
  story_type            TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'TODO',
  is_blocked            INTEGER NOT NULL DEFAULT 0,
  blocked_reason        TEXT,
  priority              INTEGER,
  metadata_json         TEXT,
  created_by            TEXT,
  updated_by            TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  completed_at          TEXT, started_at TEXT, current_assignee_agent_id TEXT,
  CHECK (project_id IS NOT NULL OR key IS NULL)
);

CREATE TABLE IF NOT EXISTS tasks (
  id                        TEXT PRIMARY KEY,
  project_id                TEXT REFERENCES projects(id) ON DELETE CASCADE,
  story_id                  TEXT REFERENCES stories(id) ON DELETE SET NULL,
  key                       TEXT,
  title                     TEXT NOT NULL,
  objective                 TEXT,
  task_type                 TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'TODO',
  is_blocked                INTEGER NOT NULL DEFAULT 0,
  blocked_reason            TEXT,
  priority                  INTEGER,
  estimate_points           REAL,
  due_at                    TEXT,
  current_assignee_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  metadata_json             TEXT,
  created_by                TEXT,
  updated_by                TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  started_at                TEXT,
  completed_at              TEXT,
  CHECK (project_id IS NOT NULL OR key IS NULL)
);

CREATE TABLE IF NOT EXISTS backlogs (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'BACKLOG',
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  is_default    INTEGER NOT NULL DEFAULT 0,
  goal          TEXT,
  start_date    TEXT,
  end_date      TEXT,
  metadata_json TEXT,
  created_by    TEXT,
  updated_by    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
, display_order INTEGER NOT NULL DEFAULT 1000);

CREATE TABLE IF NOT EXISTS backlog_stories (
  backlog_id TEXT NOT NULL REFERENCES backlogs(id) ON DELETE CASCADE,
  story_id   TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  added_at   TEXT NOT NULL,
  PRIMARY KEY (backlog_id, story_id),
  UNIQUE(story_id)
);

CREATE TABLE IF NOT EXISTS backlog_tasks (
  backlog_id TEXT NOT NULL REFERENCES backlogs(id) ON DELETE CASCADE,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  added_at   TEXT NOT NULL,
  PRIMARY KEY (backlog_id, task_id),
  UNIQUE(task_id)
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  assigned_at   TEXT NOT NULL,
  unassigned_at TEXT,
  assigned_by   TEXT,
  reason        TEXT
);

CREATE TABLE IF NOT EXISTS labels (
  id         TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS story_labels (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (story_id, label_id)
);

CREATE TABLE IF NOT EXISTS task_labels (
  task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (task_id, label_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  project_id  TEXT,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_by  TEXT,
  created_at  TEXT NOT NULL,
  edited_by   TEXT,
  edited_at   TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id            TEXT PRIMARY KEY,
  project_id    TEXT,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  filename      TEXT NOT NULL,
  content_type  TEXT,
  size_bytes    INTEGER,
  storage_url   TEXT,
  file_path     TEXT,
  metadata_json TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id              TEXT PRIMARY KEY,
  project_id      TEXT,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  epic_id         TEXT,
  story_id        TEXT,
  task_id         TEXT,
  backlog_id      TEXT,
  actor_type      TEXT NOT NULL,
  actor_id        TEXT,
  session_id      TEXT,
  run_id          TEXT,
  event_name      TEXT NOT NULL,
  message         TEXT,
  event_data_json TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS epic_status_history (
  id          TEXT PRIMARY KEY,
  project_id  TEXT,
  epic_id     TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_by  TEXT,
  changed_at  TEXT NOT NULL,
  note        TEXT
);

CREATE TABLE IF NOT EXISTS story_status_history (
  id          TEXT PRIMARY KEY,
  project_id  TEXT,
  story_id    TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_by  TEXT,
  changed_at  TEXT NOT NULL,
  note        TEXT
);

CREATE TABLE IF NOT EXISTS task_status_history (
  id          TEXT PRIMARY KEY,
  project_id  TEXT,
  task_id     TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_by  TEXT,
  changed_at  TEXT NOT NULL,
  note        TEXT
);

CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS orchestration_commands (
          id TEXT PRIMARY KEY,
          command_type TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          producer TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          causation_id TEXT,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

CREATE TABLE IF NOT EXISTS orchestration_outbox (
          id TEXT PRIMARY KEY,
          command_id TEXT NOT NULL REFERENCES orchestration_commands(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          producer TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          causation_id TEXT,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          available_at TEXT NOT NULL,
          published_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL
        , retry_attempt INTEGER NOT NULL DEFAULT 1, max_attempts INTEGER NOT NULL DEFAULT 5, dead_lettered_at TEXT, dead_letter_payload_json TEXT);

CREATE TABLE IF NOT EXISTS orchestration_consumer_offsets (
          stream_key TEXT NOT NULL,
          consumer_group TEXT NOT NULL,
          consumer_name TEXT NOT NULL,
          last_message_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (stream_key, consumer_group, consumer_name)
        );

CREATE TABLE IF NOT EXISTS orchestration_processed_messages (
          stream_key TEXT NOT NULL,
          consumer_group TEXT NOT NULL,
          message_id TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          processed_at TEXT NOT NULL,
          PRIMARY KEY (stream_key, consumer_group, message_id)
        );

CREATE TABLE IF NOT EXISTS orchestration_runs (
          run_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          current_step_id TEXT,
          last_event_type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          terminal_at TEXT
        , run_type TEXT NOT NULL DEFAULT 'DEFAULT', lease_owner TEXT, lease_token TEXT, last_heartbeat_at TEXT, watchdog_timeout_at TEXT, watchdog_attempt INTEGER NOT NULL DEFAULT 0, watchdog_state TEXT NOT NULL DEFAULT 'NONE');

CREATE TABLE IF NOT EXISTS orchestration_run_steps (
          step_id TEXT NOT NULL,
          run_id TEXT NOT NULL REFERENCES orchestration_runs(run_id) ON DELETE CASCADE,
          status TEXT NOT NULL,
          last_event_type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          terminal_at TEXT,
          PRIMARY KEY (run_id, step_id)
        );

CREATE TABLE IF NOT EXISTS orchestration_run_timeline (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          step_id TEXT,
          message_id TEXT,
          event_type TEXT NOT NULL,
          decision TEXT NOT NULL,
          reason_code TEXT,
          reason_message TEXT,
          correlation_id TEXT NOT NULL,
          causation_id TEXT,
          payload_json TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);

CREATE INDEX IF NOT EXISTS idx_activity_log_entity
  ON activity_log(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_project_id ON activity_log(project_id);

CREATE INDEX IF NOT EXISTS idx_attachments_entity
  ON attachments(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_attachments_project_id ON attachments(project_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_backlogs_one_active_sprint_per_project
  ON backlogs(project_id)
  WHERE project_id IS NOT NULL AND kind = 'SPRINT' AND status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_backlogs_one_default
  ON backlogs(project_id) WHERE is_default = 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_backlogs_one_default_per_project
              ON backlogs(project_id)
              WHERE project_id IS NOT NULL AND is_default = 1;

CREATE INDEX IF NOT EXISTS idx_backlogs_project_display_order
  ON backlogs(project_id, display_order);

CREATE INDEX IF NOT EXISTS idx_backlogs_project_id ON backlogs(project_id);

CREATE INDEX IF NOT EXISTS idx_comments_entity
  ON comments(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_comments_project_id ON comments(project_id);

CREATE INDEX IF NOT EXISTS idx_epic_status_history_epic_id ON epic_status_history(epic_id);

CREATE INDEX IF NOT EXISTS idx_epics_project_id ON epics(project_id);

CREATE INDEX IF NOT EXISTS idx_epics_status ON epics(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_global_name
  ON labels(name) WHERE project_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_project_name
  ON labels(project_id, name) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orchestration_commands_created_at
          ON orchestration_commands(created_at);

CREATE INDEX IF NOT EXISTS idx_orchestration_outbox_command_id
          ON orchestration_outbox(command_id);

CREATE INDEX IF NOT EXISTS idx_orchestration_outbox_status_available_at
          ON orchestration_outbox(status, available_at);

CREATE INDEX IF NOT EXISTS idx_orchestration_processed_messages_correlation
          ON orchestration_processed_messages(correlation_id);

CREATE INDEX IF NOT EXISTS idx_orchestration_run_steps_run_status
          ON orchestration_run_steps(run_id, status, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orchestration_run_timeline_message
          ON orchestration_run_timeline(message_id)
          WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orchestration_run_timeline_run_created
          ON orchestration_run_timeline(run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_orchestration_runs_lease_token
          ON orchestration_runs(lease_token);

CREATE INDEX IF NOT EXISTS idx_orchestration_runs_status_updated_at
          ON orchestration_runs(status, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_one_default ON projects(is_default) WHERE is_default = 1;

CREATE INDEX IF NOT EXISTS idx_stories_epic_id ON stories(epic_id);

CREATE INDEX IF NOT EXISTS idx_stories_project_id ON stories(project_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_project_key
  ON stories(project_id, key) WHERE key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);

CREATE INDEX IF NOT EXISTS idx_story_status_history_story_id ON story_status_history(story_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_assignments_active
  ON task_assignments(task_id) WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_assignments_agent_id ON task_assignments(agent_id);

CREATE INDEX IF NOT EXISTS idx_task_assignments_task_id ON task_assignments(task_id);

CREATE INDEX IF NOT EXISTS idx_task_status_history_task_id ON task_status_history(task_id);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(current_assignee_agent_id);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_project_key
  ON tasks(project_id, key) WHERE key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE INDEX IF NOT EXISTS idx_tasks_story_id ON tasks(story_id);
