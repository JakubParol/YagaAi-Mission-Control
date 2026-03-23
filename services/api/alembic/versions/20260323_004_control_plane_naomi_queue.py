"""Add control_plane_naomi_queue table for Naomi runtime queue entries.

On fresh databases: baseline already creates the table via metadata, so this is a no-op.
On existing databases: creates the table and indexes.
"""

from alembic import op
from sqlalchemy import inspect, text

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

    conn.execute(
        text("""
        CREATE TABLE control_plane_naomi_queue (
            id TEXT PRIMARY KEY,
            work_item_id TEXT NOT NULL,
            work_item_key TEXT NOT NULL,
            work_item_type TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            status TEXT NOT NULL,
            queue_position INTEGER NOT NULL,
            correlation_id TEXT NOT NULL,
            causation_id TEXT,
            enqueued_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            cancelled_at TEXT
        )
        """)
    )
    conn.execute(
        text("""
        CREATE INDEX idx_cp_naomi_queue_agent_status
            ON control_plane_naomi_queue (agent_id, status, queue_position)
        """)
    )
    conn.execute(
        text("""
        CREATE UNIQUE INDEX idx_cp_naomi_queue_work_item_status
            ON control_plane_naomi_queue (work_item_id, status)
        """)
    )


def downgrade() -> None:
    op.drop_table(TABLE_NAME)
