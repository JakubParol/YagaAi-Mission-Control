"""Add control_plane_agent_queue table for agent runtime queue entries.

On fresh databases: baseline already creates the table via metadata, so this is a no-op.
On existing databases: creates the table and indexes.

Originally named control_plane_naomi_queue, renamed to control_plane_agent_queue
for agent-agnostic design.
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "20260323_004"
down_revision = "20260318_003"
branch_labels = None
depends_on = None

NEW_TABLE = "control_plane_agent_queue"
OLD_TABLE = "control_plane_naomi_queue"


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    # Already created under the new name (fresh DB via metadata.create_all)
    if NEW_TABLE in existing_tables:
        return

    # Created under the old name by a previous deploy — rename
    if OLD_TABLE in existing_tables:
        conn.execute(
            text(f"ALTER TABLE {OLD_TABLE} RENAME TO {NEW_TABLE}")
        )
        conn.execute(
            text(
                "ALTER INDEX IF EXISTS idx_cp_naomi_queue_agent_status "
                "RENAME TO idx_cp_agent_queue_agent_status"
            )
        )
        conn.execute(
            text(
                "ALTER INDEX IF EXISTS idx_cp_naomi_queue_work_item_status "
                "RENAME TO idx_cp_agent_queue_work_item_status"
            )
        )
        return

    # Neither exists — create fresh
    conn.execute(
        text("""
        CREATE TABLE control_plane_agent_queue (
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
        CREATE INDEX idx_cp_agent_queue_agent_status
            ON control_plane_agent_queue (agent_id, status, queue_position)
        """)
    )
    conn.execute(
        text("""
        CREATE UNIQUE INDEX idx_cp_agent_queue_work_item_status
            ON control_plane_agent_queue (work_item_id, status)
        """)
    )


def downgrade() -> None:
    op.drop_table(NEW_TABLE)
