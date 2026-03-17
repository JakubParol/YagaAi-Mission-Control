"""Unified work_items model with LexoRank ordering.

Replaces stories/tasks/epics with polymorphic work_items table.
Replaces backlog_stories/backlog_tasks with backlog_items using LexoRank.
Replaces display_order on backlogs with rank.

DESTRUCTIVE MIGRATION — backup prod before running.
Downgrade requires restoring from backup.
"""

from alembic import op

revision = "20260318_003"
down_revision = "20260317_002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.planning.infrastructure.migrations.v1_to_v2_data import migrate_v1_to_v2

    migrate_v1_to_v2(op.get_bind())


def downgrade() -> None:
    raise NotImplementedError(
        "Downgrade requires restoring from backup. "
        "See infra/runbook.md for restore procedure."
    )
