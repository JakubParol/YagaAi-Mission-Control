/**
 * SQL schema statements for the v1 work-planning domain.
 *
 * All tables use CREATE TABLE IF NOT EXISTS for idempotent initialization.
 * Foreign keys cascade on core hierarchy; audit tables use logical references only.
 *
 * Canonical spec: docs/ENTITY_MODEL_V1.md
 */

// ─── Core entities ────────────────────────────────────────────────────

export const CREATE_PROJECTS_TABLE = `
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'ACTIVE',
  repo_root   TEXT,
  created_by  TEXT,
  updated_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
`;

export const CREATE_PROJECT_COUNTERS_TABLE = `
CREATE TABLE IF NOT EXISTS project_counters (
  project_id  TEXT PRIMARY KEY,
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL
);
`;

export const CREATE_EPICS_TABLE = `
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
`;

export const CREATE_STORIES_TABLE = `
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
  completed_at          TEXT,
  CHECK (project_id IS NOT NULL OR key IS NULL)
);
`;

export const CREATE_TASKS_TABLE = `
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
`;

// ─── Backlogs ─────────────────────────────────────────────────────────

export const CREATE_BACKLOGS_TABLE = `
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
);
`;

export const CREATE_BACKLOG_STORIES_TABLE = `
CREATE TABLE IF NOT EXISTS backlog_stories (
  backlog_id TEXT NOT NULL REFERENCES backlogs(id) ON DELETE CASCADE,
  story_id   TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  added_at   TEXT NOT NULL,
  PRIMARY KEY (backlog_id, story_id),
  UNIQUE(story_id)
);
`;

export const CREATE_BACKLOG_TASKS_TABLE = `
CREATE TABLE IF NOT EXISTS backlog_tasks (
  backlog_id TEXT NOT NULL REFERENCES backlogs(id) ON DELETE CASCADE,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  added_at   TEXT NOT NULL,
  PRIMARY KEY (backlog_id, task_id),
  UNIQUE(task_id)
);
`;

// ─── Agents ───────────────────────────────────────────────────────────

export const CREATE_AGENTS_TABLE = `
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
);
`;

// ─── Task Assignments ─────────────────────────────────────────────────

export const CREATE_TASK_ASSIGNMENTS_TABLE = `
CREATE TABLE IF NOT EXISTS task_assignments (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  assigned_at   TEXT NOT NULL,
  unassigned_at TEXT,
  assigned_by   TEXT,
  reason        TEXT
);
`;

// ─── Labels ───────────────────────────────────────────────────────────

export const CREATE_LABELS_TABLE = `
CREATE TABLE IF NOT EXISTS labels (
  id         TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT,
  created_at TEXT NOT NULL
);
`;

export const CREATE_STORY_LABELS_TABLE = `
CREATE TABLE IF NOT EXISTS story_labels (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (story_id, label_id)
);
`;

export const CREATE_TASK_LABELS_TABLE = `
CREATE TABLE IF NOT EXISTS task_labels (
  task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (task_id, label_id)
);
`;

// ─── Comments ─────────────────────────────────────────────────────────

export const CREATE_COMMENTS_TABLE = `
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
`;

// ─── Attachments ──────────────────────────────────────────────────────

export const CREATE_ATTACHMENTS_TABLE = `
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
`;

// ─── Activity Log ─────────────────────────────────────────────────────

export const CREATE_ACTIVITY_LOG_TABLE = `
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
`;

// ─── Status History (audit) ───────────────────────────────────────────

export const CREATE_EPIC_STATUS_HISTORY_TABLE = `
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
`;

export const CREATE_STORY_STATUS_HISTORY_TABLE = `
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
`;

export const CREATE_TASK_STATUS_HISTORY_TABLE = `
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
`;

// ─── Partial Unique Indexes ───────────────────────────────────────────

/** Partial unique on stories(project_id, key) WHERE key IS NOT NULL */
export const IDX_STORIES_PROJECT_KEY = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_project_key
  ON stories(project_id, key) WHERE key IS NOT NULL;
`;

/** Partial unique on tasks(project_id, key) WHERE key IS NOT NULL */
export const IDX_TASKS_PROJECT_KEY = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_project_key
  ON tasks(project_id, key) WHERE key IS NOT NULL;
`;

/** One default backlog per project */
export const IDX_BACKLOGS_DEFAULT = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_backlogs_one_default
  ON backlogs(project_id) WHERE is_default = 1;
`;

/** One active assignment per task */
export const IDX_TASK_ASSIGNMENTS_ACTIVE = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_assignments_active
  ON task_assignments(task_id) WHERE unassigned_at IS NULL;
`;

/** Unique project-scoped label name */
export const IDX_LABELS_PROJECT_NAME = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_project_name
  ON labels(project_id, name) WHERE project_id IS NOT NULL;
`;

/** Unique global label name */
export const IDX_LABELS_GLOBAL_NAME = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_global_name
  ON labels(name) WHERE project_id IS NULL;
`;

// ─── Query Performance Indexes ────────────────────────────────────────

export const IDX_EPICS_PROJECT = `
CREATE INDEX IF NOT EXISTS idx_epics_project_id ON epics(project_id);
`;

export const IDX_EPICS_STATUS = `
CREATE INDEX IF NOT EXISTS idx_epics_status ON epics(status);
`;

export const IDX_STORIES_PROJECT = `
CREATE INDEX IF NOT EXISTS idx_stories_project_id ON stories(project_id);
`;

export const IDX_STORIES_EPIC = `
CREATE INDEX IF NOT EXISTS idx_stories_epic_id ON stories(epic_id);
`;

export const IDX_STORIES_STATUS = `
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
`;

export const IDX_TASKS_PROJECT = `
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
`;

export const IDX_TASKS_STORY = `
CREATE INDEX IF NOT EXISTS idx_tasks_story_id ON tasks(story_id);
`;

export const IDX_TASKS_STATUS = `
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
`;

export const IDX_TASKS_ASSIGNEE = `
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(current_assignee_agent_id);
`;

export const IDX_BACKLOGS_PROJECT = `
CREATE INDEX IF NOT EXISTS idx_backlogs_project_id ON backlogs(project_id);
`;

export const IDX_TASK_ASSIGNMENTS_TASK = `
CREATE INDEX IF NOT EXISTS idx_task_assignments_task_id ON task_assignments(task_id);
`;

export const IDX_TASK_ASSIGNMENTS_AGENT = `
CREATE INDEX IF NOT EXISTS idx_task_assignments_agent_id ON task_assignments(agent_id);
`;

export const IDX_COMMENTS_ENTITY = `
CREATE INDEX IF NOT EXISTS idx_comments_entity
  ON comments(entity_type, entity_id);
`;

export const IDX_COMMENTS_PROJECT = `
CREATE INDEX IF NOT EXISTS idx_comments_project_id ON comments(project_id);
`;

export const IDX_ATTACHMENTS_ENTITY = `
CREATE INDEX IF NOT EXISTS idx_attachments_entity
  ON attachments(entity_type, entity_id);
`;

export const IDX_ATTACHMENTS_PROJECT = `
CREATE INDEX IF NOT EXISTS idx_attachments_project_id ON attachments(project_id);
`;

export const IDX_ACTIVITY_LOG_ENTITY = `
CREATE INDEX IF NOT EXISTS idx_activity_log_entity
  ON activity_log(entity_type, entity_id);
`;

export const IDX_ACTIVITY_LOG_PROJECT = `
CREATE INDEX IF NOT EXISTS idx_activity_log_project_id ON activity_log(project_id);
`;

export const IDX_ACTIVITY_LOG_CREATED = `
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
`;

export const IDX_EPIC_STATUS_HISTORY_EPIC = `
CREATE INDEX IF NOT EXISTS idx_epic_status_history_epic_id ON epic_status_history(epic_id);
`;

export const IDX_STORY_STATUS_HISTORY_STORY = `
CREATE INDEX IF NOT EXISTS idx_story_status_history_story_id ON story_status_history(story_id);
`;

export const IDX_TASK_STATUS_HISTORY_TASK = `
CREATE INDEX IF NOT EXISTS idx_task_status_history_task_id ON task_status_history(task_id);
`;

// ─── All planning schema statements in order ──────────────────────────

export const PLANNING_SCHEMA_STATEMENTS: string[] = [
  // Core tables (order matters for FK references)
  CREATE_PROJECTS_TABLE,
  CREATE_PROJECT_COUNTERS_TABLE,
  CREATE_AGENTS_TABLE,
  CREATE_EPICS_TABLE,
  CREATE_STORIES_TABLE,
  CREATE_TASKS_TABLE,
  CREATE_BACKLOGS_TABLE,
  CREATE_BACKLOG_STORIES_TABLE,
  CREATE_BACKLOG_TASKS_TABLE,
  CREATE_TASK_ASSIGNMENTS_TABLE,
  CREATE_LABELS_TABLE,
  CREATE_STORY_LABELS_TABLE,
  CREATE_TASK_LABELS_TABLE,
  CREATE_COMMENTS_TABLE,
  CREATE_ATTACHMENTS_TABLE,
  CREATE_ACTIVITY_LOG_TABLE,
  CREATE_EPIC_STATUS_HISTORY_TABLE,
  CREATE_STORY_STATUS_HISTORY_TABLE,
  CREATE_TASK_STATUS_HISTORY_TABLE,

  // Partial unique indexes
  IDX_STORIES_PROJECT_KEY,
  IDX_TASKS_PROJECT_KEY,
  IDX_BACKLOGS_DEFAULT,
  IDX_TASK_ASSIGNMENTS_ACTIVE,
  IDX_LABELS_PROJECT_NAME,
  IDX_LABELS_GLOBAL_NAME,

  // Performance indexes
  IDX_EPICS_PROJECT,
  IDX_EPICS_STATUS,
  IDX_STORIES_PROJECT,
  IDX_STORIES_EPIC,
  IDX_STORIES_STATUS,
  IDX_TASKS_PROJECT,
  IDX_TASKS_STORY,
  IDX_TASKS_STATUS,
  IDX_TASKS_ASSIGNEE,
  IDX_BACKLOGS_PROJECT,
  IDX_TASK_ASSIGNMENTS_TASK,
  IDX_TASK_ASSIGNMENTS_AGENT,
  IDX_COMMENTS_ENTITY,
  IDX_COMMENTS_PROJECT,
  IDX_ATTACHMENTS_ENTITY,
  IDX_ATTACHMENTS_PROJECT,
  IDX_ACTIVITY_LOG_ENTITY,
  IDX_ACTIVITY_LOG_PROJECT,
  IDX_ACTIVITY_LOG_CREATED,
  IDX_EPIC_STATUS_HISTORY_EPIC,
  IDX_STORY_STATUS_HISTORY_STORY,
  IDX_TASK_STATUS_HISTORY_TASK,
];
