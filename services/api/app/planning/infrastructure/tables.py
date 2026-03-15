from sqlalchemy import (
    REAL,
    Column,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    Table,
    Text,
    UniqueConstraint,
    text,
)

from app.shared.db.metadata import metadata

projects = Table(
    "projects",
    metadata,
    Column("id", Text, primary_key=True),
    Column("key", Text, nullable=False, unique=True),
    Column("name", Text, nullable=False),
    Column("description", Text),
    Column("status", Text, nullable=False),
    Column("is_default", Integer, nullable=False, server_default=text("0")),
    Column("repo_root", Text),
    Column("created_by", Text),
    Column("updated_by", Text),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
)

project_counters = Table(
    "project_counters",
    metadata,
    Column("project_id", Text, primary_key=True),
    Column("next_number", Integer, nullable=False, server_default=text("1")),
    Column("updated_at", Text, nullable=False),
)

epics = Table(
    "epics",
    metadata,
    Column("id", Text, primary_key=True),
    Column("project_id", Text, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
    Column("key", Text, nullable=False),
    Column("title", Text, nullable=False),
    Column("description", Text),
    Column("status", Text, nullable=False, server_default=text("'TODO'")),
    Column("status_mode", Text, nullable=False, server_default=text("'MANUAL'")),
    Column("status_override", Text),
    Column("status_override_set_at", Text),
    Column("is_blocked", Integer, nullable=False, server_default=text("0")),
    Column("blocked_reason", Text),
    Column("priority", Integer),
    Column("metadata_json", Text),
    Column("created_by", Text),
    Column("updated_by", Text),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    UniqueConstraint("project_id", "key"),
)

agents = Table(
    "agents",
    metadata,
    Column("id", Text, primary_key=True),
    Column("openclaw_key", Text, nullable=False, unique=True),
    Column("name", Text, nullable=False),
    Column("last_name", Text),
    Column("initials", Text),
    Column("role", Text),
    Column("worker_type", Text),
    Column("avatar", Text),
    Column("is_active", Integer, nullable=False, server_default=text("1")),
    Column("source", Text, nullable=False, server_default=text("'manual'")),
    Column("metadata_json", Text),
    Column("last_synced_at", Text),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
)

stories = Table(
    "stories",
    metadata,
    Column("id", Text, primary_key=True),
    Column("project_id", Text, ForeignKey("projects.id", ondelete="CASCADE")),
    Column("epic_id", Text, ForeignKey("epics.id", ondelete="SET NULL")),
    Column("key", Text),
    Column("title", Text, nullable=False),
    Column("intent", Text),
    Column("description", Text),
    Column("story_type", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("is_blocked", Integer, nullable=False, server_default=text("0")),
    Column("blocked_reason", Text),
    Column("priority", Integer),
    Column("current_assignee_agent_id", Text, ForeignKey("agents.id", ondelete="SET NULL")),
    Column("metadata_json", Text),
    Column("created_by", Text),
    Column("updated_by", Text),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    Column("started_at", Text),
    Column("completed_at", Text),
)

tasks = Table(
    "tasks",
    metadata,
    Column("id", Text, primary_key=True),
    Column("project_id", Text, ForeignKey("projects.id", ondelete="CASCADE")),
    Column("story_id", Text, ForeignKey("stories.id", ondelete="SET NULL")),
    Column("key", Text),
    Column("title", Text, nullable=False),
    Column("objective", Text),
    Column("task_type", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("is_blocked", Integer, nullable=False, server_default=text("0")),
    Column("blocked_reason", Text),
    Column("priority", Integer),
    Column("estimate_points", REAL),
    Column("due_at", Text),
    Column("current_assignee_agent_id", Text, ForeignKey("agents.id", ondelete="SET NULL")),
    Column("metadata_json", Text),
    Column("created_by", Text),
    Column("updated_by", Text),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    Column("started_at", Text),
    Column("completed_at", Text),
)

backlogs = Table(
    "backlogs",
    metadata,
    Column("id", Text, primary_key=True),
    Column("project_id", Text, ForeignKey("projects.id", ondelete="CASCADE")),
    Column("name", Text, nullable=False),
    Column("kind", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("display_order", Integer, nullable=False, server_default=text("1000")),
    Column("is_default", Integer, nullable=False, server_default=text("0")),
    Column("goal", Text),
    Column("start_date", Text),
    Column("end_date", Text),
    Column("metadata_json", Text),
    Column("created_by", Text),
    Column("updated_by", Text),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
)

backlog_stories = Table(
    "backlog_stories",
    metadata,
    Column("backlog_id", Text, ForeignKey("backlogs.id", ondelete="CASCADE"), nullable=False),
    Column("story_id", Text, ForeignKey("stories.id", ondelete="CASCADE"), nullable=False),
    Column("position", Integer, nullable=False),
    Column("added_at", Text, nullable=False),
    PrimaryKeyConstraint("backlog_id", "story_id"),
    UniqueConstraint("story_id"),
)

backlog_tasks = Table(
    "backlog_tasks",
    metadata,
    Column("backlog_id", Text, ForeignKey("backlogs.id", ondelete="CASCADE"), nullable=False),
    Column("task_id", Text, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
    Column("position", Integer, nullable=False),
    Column("added_at", Text, nullable=False),
    PrimaryKeyConstraint("backlog_id", "task_id"),
    UniqueConstraint("task_id"),
)

labels = Table(
    "labels",
    metadata,
    Column("id", Text, primary_key=True),
    Column("project_id", Text, ForeignKey("projects.id", ondelete="CASCADE")),
    Column("name", Text, nullable=False),
    Column("color", Text),
    Column("created_at", Text, nullable=False),
)

story_labels = Table(
    "story_labels",
    metadata,
    Column("story_id", Text, ForeignKey("stories.id", ondelete="CASCADE"), nullable=False),
    Column("label_id", Text, ForeignKey("labels.id", ondelete="CASCADE"), nullable=False),
    Column("added_at", Text, nullable=False),
    PrimaryKeyConstraint("story_id", "label_id"),
)

task_labels = Table(
    "task_labels",
    metadata,
    Column("task_id", Text, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
    Column("label_id", Text, ForeignKey("labels.id", ondelete="CASCADE"), nullable=False),
    Column("added_at", Text, nullable=False),
    PrimaryKeyConstraint("task_id", "label_id"),
)

task_assignments = Table(
    "task_assignments",
    metadata,
    Column("id", Text, primary_key=True),
    Column("task_id", Text, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
    Column("agent_id", Text, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
    Column("assigned_at", Text, nullable=False),
    Column("unassigned_at", Text),
    Column("assigned_by", Text),
    Column("reason", Text),
)

activity_log = Table(
    "activity_log",
    metadata,
    Column("id", Text, primary_key=True),
    Column("project_id", Text),
    Column("entity_type", Text, nullable=False),
    Column("entity_id", Text, nullable=False),
    Column("epic_id", Text),
    Column("story_id", Text),
    Column("task_id", Text),
    Column("backlog_id", Text),
    Column("actor_type", Text, nullable=False),
    Column("actor_id", Text),
    Column("session_id", Text),
    Column("run_id", Text),
    Column("event_name", Text, nullable=False),
    Column("message", Text),
    Column("event_data_json", Text),
    Column("created_at", Text, nullable=False),
)

Index(
    "idx_task_assignments_active",
    task_assignments.c.task_id,
    unique=True,
    postgresql_where=text("unassigned_at IS NULL"),
)
Index(
    "idx_activity_log_entity",
    activity_log.c.entity_type,
    activity_log.c.entity_id,
    activity_log.c.created_at,
)
Index(
    "idx_projects_one_default",
    projects.c.is_default,
    unique=True,
    postgresql_where=text("is_default = 1"),
)
Index(
    "idx_backlogs_one_default_per_project",
    backlogs.c.project_id,
    unique=True,
    postgresql_where=text("project_id IS NOT NULL AND is_default = 1"),
)
Index(
    "idx_backlogs_one_active_sprint_per_project",
    backlogs.c.project_id,
    unique=True,
    postgresql_where=text("project_id IS NOT NULL AND kind = 'SPRINT' AND status = 'ACTIVE'"),
)
Index("idx_backlogs_project_display_order", backlogs.c.project_id, backlogs.c.display_order)
