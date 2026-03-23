"""Rename control_plane_naomi_queue to control_plane_agent_queue.

On fresh databases the table is already named correctly — no-op.
On existing databases with the old name — rename table and indexes.
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "20260323_005"
down_revision = "20260323_004"
branch_labels = None
depends_on = None

OLD_TABLE = "control_plane_naomi_queue"
NEW_TABLE = "control_plane_agent_queue"


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    if OLD_TABLE not in existing_tables:
        return

    conn.execute(text(f"ALTER TABLE {OLD_TABLE} RENAME TO {NEW_TABLE}"))
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


def downgrade() -> None:
    op.rename_table(NEW_TABLE, OLD_TABLE)
