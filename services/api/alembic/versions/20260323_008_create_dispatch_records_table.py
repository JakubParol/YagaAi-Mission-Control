"""Create control_plane_dispatch_records table.

Persists dispatch attempt metadata: envelope sent, OpenClaw session
metadata returned, and failure details for operator visibility.
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "20260323_008"
down_revision = "20260323_007"
branch_labels = None
depends_on = None

TABLE = "control_plane_dispatch_records"


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if TABLE in inspector.get_table_names():
        return

    conn.execute(
        text(f"""
        CREATE TABLE {TABLE} (
            id            TEXT PRIMARY KEY,
            queue_entry_id TEXT NOT NULL,
            run_id        TEXT NOT NULL,
            agent_id      TEXT NOT NULL,
            work_item_id  TEXT NOT NULL,
            work_item_key TEXT NOT NULL,
            status        TEXT NOT NULL,
            envelope_json TEXT NOT NULL,
            session_id    TEXT,
            process_id    INTEGER,
            error_message TEXT,
            dispatched_at TEXT,
            created_at    TEXT NOT NULL
        )
        """)
    )
    conn.execute(
        text(f"""
        CREATE INDEX idx_cp_dispatch_records_queue_entry
            ON {TABLE} (queue_entry_id)
        """)
    )
    conn.execute(
        text(f"""
        CREATE INDEX idx_cp_dispatch_records_run_id
            ON {TABLE} (run_id)
        """)
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text(f"DROP TABLE IF EXISTS {TABLE}"))
