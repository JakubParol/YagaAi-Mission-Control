"""Add control_plane_naomi_queue table for Naomi runtime queue entries.

On fresh databases: baseline already creates the table via metadata, so this is a no-op.
On existing databases: creates the table and indexes.
"""

from alembic import op
from sqlalchemy import Column, Index, Integer, Table, Text, inspect

from app.shared.db.metadata import metadata

revision = "20260323_004"
down_revision = "20260318_003"
branch_labels = None
depends_on = None

TABLE_NAME = "control_plane_naomi_queue"


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    if TABLE_NAME in existing_tables:
        return

    table = Table(
        TABLE_NAME,
        metadata,
        Column("id", Text, primary_key=True),
        Column("work_item_id", Text, nullable=False),
        Column("work_item_key", Text, nullable=False),
        Column("work_item_type", Text, nullable=False),
        Column("agent_id", Text, nullable=False),
        Column("status", Text, nullable=False),
        Column("queue_position", Integer, nullable=False),
        Column("correlation_id", Text, nullable=False),
        Column("causation_id", Text),
        Column("enqueued_at", Text, nullable=False),
        Column("updated_at", Text, nullable=False),
        Column("cancelled_at", Text),
        keep_existing=True,
    )
    table.create(conn)

    Index(
        "idx_cp_naomi_queue_agent_status",
        table.c.agent_id,
        table.c.status,
        table.c.queue_position,
    ).create(conn)
    Index(
        "idx_cp_naomi_queue_work_item_status",
        table.c.work_item_id,
        table.c.status,
        unique=True,
    ).create(conn)


def downgrade() -> None:
    op.drop_table(TABLE_NAME)
