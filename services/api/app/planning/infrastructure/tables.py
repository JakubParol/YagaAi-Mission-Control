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

# ---------------------------------------------------------------------------
# Work Items — unified polymorphic table (replaces stories, tasks, epics)
# ---------------------------------------------------------------------------

work_items = Table(
    "work_items",
    metadata,
    Column("id", Text, primary_key=True),
    Column("project_id", Text, ForeignKey("projects.id", ondelete="CASCADE")),
    Column("parent_id", Text, ForeignKey("work_items.id", ondelete="SET NULL")),
    Column("key", Text),
    Column("type", Text, nullable=False),
    Column("sub_type", Text),
    Column("title", Text, nullable=False),
    Column("summary", Text),
    Column("description", Text),
    Column("status", Text, nullable=False, server_default=text("'TODO'")),
    Column("status_mode", Text, nullable=False, server_default=text("'MANUAL'")),
    Column("status_override", Text),
    Column("status_override_set_at", Text),
    Column("is_blocked", Integer, nullable=False, server_default=text("0")),
    Column("blocked_reason", Text),
    Column("priority", Integer),
    Column("estimate_points", REAL),
    Column("due_at", Text),
    Column(
        "current_assignee_agent_id",
        Text,
        ForeignKey("agents.id", ondelete="SET NULL"),
    ),
    Column("metadata_json", Text),
    Column("created_by", Text),
    Column("updated_by", Text),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    Column("started_at", Text),
    Column("completed_at", Text),
)

# ---------------------------------------------------------------------------
# Backlogs — rank replaces display_order
# ---------------------------------------------------------------------------

backlogs = Table(
    "backlogs",
    metadata,
    Column("id", Text, primary_key=True),
    Column("project_id", Text, ForeignKey("projects.id", ondelete="CASCADE")),
    Column("name", Text, nullable=False),
    Column("kind", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("rank", Text, nullable=False, server_default=text("'n'")),
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

# ---------------------------------------------------------------------------
# Backlog Items — unified (replaces backlog_stories + backlog_tasks)
# ---------------------------------------------------------------------------

backlog_items = Table(
    "backlog_items",
    metadata,
    Column(
        "backlog_id",
        Text,
        ForeignKey("backlogs.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "work_item_id",
        Text,
        ForeignKey("work_items.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("rank", Text, nullable=False),
    Column("added_at", Text, nullable=False),
    PrimaryKeyConstraint("backlog_id", "work_item_id"),
    UniqueConstraint("work_item_id"),
)

# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------

labels = Table(
    "labels",
    metadata,
    Column("id", Text, primary_key=True),
    Column("project_id", Text, ForeignKey("projects.id", ondelete="CASCADE")),
    Column("name", Text, nullable=False),
    Column("color", Text),
    Column("created_at", Text, nullable=False),
)

work_item_labels = Table(
    "work_item_labels",
    metadata,
    Column(
        "work_item_id",
        Text,
        ForeignKey("work_items.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "label_id",
        Text,
        ForeignKey("labels.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("added_at", Text, nullable=False),
    PrimaryKeyConstraint("work_item_id", "label_id"),
)

# ---------------------------------------------------------------------------
# Assignments — unified (replaces task_assignments)
# ---------------------------------------------------------------------------

work_item_assignments = Table(
    "work_item_assignments",
    metadata,
    Column("id", Text, primary_key=True),
    Column(
        "work_item_id",
        Text,
        ForeignKey("work_items.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "agent_id",
        Text,
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("assigned_at", Text, nullable=False),
    Column("unassigned_at", Text),
    Column("assigned_by", Text),
    Column("reason", Text),
)

# ---------------------------------------------------------------------------
# Audit / history
# ---------------------------------------------------------------------------

activity_log = Table(
    "activity_log",
    metadata,
    Column("id", Text, primary_key=True),
    Column("project_id", Text),
    Column("entity_type", Text, nullable=False),
    Column("entity_id", Text, nullable=False),
    Column("work_item_id", Text),
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

work_item_status_history = Table(
    "work_item_status_history",
    metadata,
    Column("id", Text, primary_key=True),
    Column("project_id", Text),
    Column("work_item_id", Text, nullable=False),
    Column("from_status", Text),
    Column("to_status", Text, nullable=False),
    Column("changed_by", Text),
    Column("changed_at", Text, nullable=False),
    Column("note", Text),
)

# ---------------------------------------------------------------------------
# Indexes
# ---------------------------------------------------------------------------

# Work items
Index("idx_work_items_project_id", work_items.c.project_id)
Index("idx_work_items_parent_id", work_items.c.parent_id)
Index("idx_work_items_type", work_items.c.type)
Index("idx_work_items_status", work_items.c.status)
Index(
    "idx_work_items_project_key",
    work_items.c.project_id,
    work_items.c.key,
    unique=True,
    postgresql_where=text("key IS NOT NULL"),
)
Index("idx_work_items_project_type", work_items.c.project_id, work_items.c.type)
Index("idx_work_items_parent_status", work_items.c.parent_id, work_items.c.status)
Index(
    "idx_work_items_assignee",
    work_items.c.current_assignee_agent_id,
    postgresql_where=text("current_assignee_agent_id IS NOT NULL"),
)

# Backlog items
Index("idx_backlog_items_backlog_rank", backlog_items.c.backlog_id, backlog_items.c.rank)

# Backlogs
Index("idx_backlogs_project_rank", backlogs.c.project_id, backlogs.c.rank)
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

# Assignments
Index(
    "idx_work_item_assignments_active",
    work_item_assignments.c.work_item_id,
    unique=True,
    postgresql_where=text("unassigned_at IS NULL"),
)

# Activity log
Index(
    "idx_activity_log_entity",
    activity_log.c.entity_type,
    activity_log.c.entity_id,
    activity_log.c.created_at,
)

# Projects
Index(
    "idx_projects_one_default",
    projects.c.is_default,
    unique=True,
    postgresql_where=text("is_default = 1"),
)

# Status history
Index(
    "idx_work_item_status_history_item",
    work_item_status_history.c.work_item_id,
    work_item_status_history.c.changed_at,
)
