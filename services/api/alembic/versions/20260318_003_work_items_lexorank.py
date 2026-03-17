"""Unified work_items model with LexoRank ordering.

Replaces stories/tasks/epics with polymorphic work_items table.
Replaces backlog_stories/backlog_tasks with backlog_items using LexoRank.
Replaces display_order on backlogs with rank.

On fresh databases: baseline already creates the new schema, so this is a no-op.
On existing databases: runs destructive data migration.
BACKUP PROD BEFORE RUNNING.
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "20260318_003"
down_revision = "20260317_002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    # If work_items already exists (fresh DB via metadata.create_all),
    # the baseline already created the new schema — nothing to do.
    if "work_items" in existing_tables and "epics" not in existing_tables:
        return

    # Old schema present (or partially present) — run the migration.
    # The migration handles missing tables gracefully.
    from app.planning.infrastructure.migrations.v1_to_v2_data import migrate_v1_to_v2

    migrate_v1_to_v2(conn)


def downgrade() -> None:
    raise NotImplementedError(
        "Downgrade requires restoring from backup. "
        "See infra/runbook.md for restore procedure."
    )
