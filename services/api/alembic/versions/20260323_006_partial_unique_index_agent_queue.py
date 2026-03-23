"""Replace full unique index with partial unique on active queue states.

The previous unique index on (work_item_id, status) blocks legal
re-queue/cancel cycles because terminal rows (CANCELLED, DONE, FAILED)
accumulate. Replace with a partial unique index covering only active
states so at most one active queue entry exists per work item.
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "20260323_006"
down_revision = "20260323_005"
branch_labels = None
depends_on = None

TABLE = "control_plane_agent_queue"
OLD_INDEX = "idx_cp_agent_queue_work_item_status"
NEW_INDEX = "idx_cp_agent_queue_work_item_active"


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if TABLE not in inspector.get_table_names():
        return

    existing_indexes = {idx["name"] for idx in inspector.get_indexes(TABLE)}

    if OLD_INDEX in existing_indexes:
        conn.execute(text(f"DROP INDEX {OLD_INDEX}"))

    if NEW_INDEX not in existing_indexes:
        conn.execute(
            text(f"""
            CREATE UNIQUE INDEX {NEW_INDEX}
                ON {TABLE} (work_item_id)
                WHERE status IN ('QUEUED', 'DISPATCHING', 'ACK_PENDING')
            """)
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text(f"DROP INDEX IF EXISTS {NEW_INDEX}"))
    conn.execute(
        text(f"""
        CREATE UNIQUE INDEX {OLD_INDEX}
            ON {TABLE} (work_item_id, status)
        """)
    )
