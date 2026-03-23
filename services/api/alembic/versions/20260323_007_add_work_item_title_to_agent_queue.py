"""Add work_item_title column to control_plane_agent_queue.

Stores the work item title at enqueue time for use in dispatch envelopes
without requiring cross-module lookups at dispatch time.
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "20260323_007"
down_revision = "20260323_006"
branch_labels = None
depends_on = None

TABLE = "control_plane_agent_queue"
COLUMN = "work_item_title"


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if TABLE not in inspector.get_table_names():
        return

    existing_cols = {col["name"] for col in inspector.get_columns(TABLE)}
    if COLUMN not in existing_cols:
        conn.execute(
            text(f"ALTER TABLE {TABLE} ADD COLUMN {COLUMN} TEXT NOT NULL DEFAULT ''")
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text(f"ALTER TABLE {TABLE} DROP COLUMN IF EXISTS {COLUMN}"))
